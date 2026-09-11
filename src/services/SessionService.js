const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { randomUUID, createHash } = require('crypto');
const { Prisma } = require('@prisma/client');
const db = require('../prisma/client');
const Notifications = require('../models/Notifications.model');
const { isIP } = require('net');
function fail(status,message,code='SECURITY_ERROR') { const error=new Error(message);error.status=status;error.code=code;throw error; }
function password(value) { if(typeof value!=='string'||value.length<8||Buffer.byteLength(value,'utf8')>72) fail(400,'Use a password of at least 8 characters and at most 72 UTF-8 bytes.'); }
const identity = user => ({id:user.id,email:user.email,super_user:user.super_user});
const version = user => createHash('sha256').update(user.password).digest('hex');
function decode(token,kind) {
    try { const value=jwt.verify(token,kind==='refresh'?process.env.JWT_REFRESH_SECRET:process.env.JWT_SECRET,{algorithms:['HS256']});
        if(value.kind!==kind||!Number.isInteger(value.sid)||!Number.isInteger(value.user?.id)) throw new Error(); return value;
    } catch { fail(401,'Your session has expired or been revoked. Sign in again.','SESSION_INVALID'); }
}
async function locked(userId,callback) {
    return db.runTransaction(async tx=>{
        await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
        const user=await tx.users.findFirst({where:{id:userId,archived:false,verified:true}});
        if(!user) fail(401,'Your session is no longer available.','SESSION_INVALID');
        return callback(tx,user);
    },{timeout:15000});
}
async function active(tx,userId,sid) {
    const session=await tx.sessions.findFirst({where:{id:sid,user_id:userId,valid:true,expires_at:{gt:new Date()}}});
    if(!session) fail(401,'Your session has expired or been revoked. Sign in again.','SESSION_INVALID');
    return session;
}
async function saveToken(tx,user,sid,kind) {
    const token=jwt.sign({user:identity(user),sid,kind},kind==='refresh'?process.env.JWT_REFRESH_SECRET:process.env.JWT_SECRET,
        {algorithm:'HS256',jwtid:randomUUID(),expiresIn:kind==='refresh'?(process.env.REFRESH_TOKEN_EXPIRES_IN||'24h'):(process.env.ACCESS_TOKEN_EXPIRES_IN||'15m')});
    const expires=new Date(jwt.decode(token).exp*1000);
    await tx.tokens.create({data:{value:token,user_id:user.id,type:kind==='refresh'?'RefreshToken':'AccessToken',valid:true,expire_date:expires}});
    return {token,expires};
}
async function login(email,secret,metadata={}) {
    if(typeof email!=='string'||typeof secret!=='string'||email.length>255||Buffer.byteLength(secret,'utf8')>72) fail(401,'Invalid email or password.');
    const candidate=await db.users.findFirst({where:{email:email.trim(),archived:false,verified:true},select:{id:true}});
    if(!candidate) fail(401,'Invalid email or password.');
    return locked(candidate.id,async(tx,user)=>{
        if(!await bcrypt.compare(secret,user.password)) fail(401,'Invalid email or password.');
        const ip=isIP(metadata.ip||'') ? metadata.ip : '0.0.0.0';
        const agent=String(metadata.agent||'Unknown browser').slice(0,512);
        const session=await tx.sessions.create({data:{user_id:user.id,ip_address:ip,user_agent:agent,valid:true,update_date:new Date()}});
        const refresh=await saveToken(tx,user,session.id,'refresh');
        const access=await saveToken(tx,user,session.id,'access');
        await tx.sessions.update({where:{id:session.id},data:{expires_at:refresh.expires}});
        await Notifications.createNotification(`New sign-in to your Imperial Bank account. Address: ${ip}. Review your active sessions in Security Sanctum if this was not you.`,user.id,tx,'security');
        return {accessToken:access.token,refreshToken:refresh.token,refreshExpires:refresh.expires};
    });
}
async function refresh(token) {
    if(!token) fail(401,'No refresh token found.','SESSION_INVALID');
    const decoded=decode(token,'refresh');
    return locked(decoded.user.id,async(tx,user)=>{
        await active(tx,user.id,decoded.sid);
        const stored=await tx.tokens.findFirst({where:{value:token,user_id:user.id,type:'RefreshToken',valid:true,expire_date:{gt:new Date()}}});
        if(!stored) fail(401,'Your session is no longer available.','SESSION_INVALID');
        return {accessToken:(await saveToken(tx,user,decoded.sid,'access')).token};
    });
}
async function authorize(token) {
    const decoded=decode(token,'access');
    const session=await db.sessions.findFirst({where:{id:decoded.sid,user_id:decoded.user.id,valid:true,expires_at:{gt:new Date()},users:{archived:false,verified:true}},include:{users:{select:{id:true,email:true,super_user:true}}}});
    const stored=session && await db.tokens.findFirst({where:{value:token,user_id:decoded.user.id,type:'AccessToken',valid:true,expire_date:{gt:new Date()}},select:{id:true}});
    if(!session||!stored) fail(401,'Your session has expired or been revoked. Sign in again.','SESSION_INVALID');
    await db.sessions.updateMany({where:{id:session.id,valid:true,OR:[{update_date:{lt:new Date(Date.now()-60000)}},{update_date:null}]},data:{update_date:new Date()}});
    return {user:identity(session.users),sid:session.id};
}
async function sessions(userId,sid) {
    return locked(userId,async(tx,user)=>{
        await active(tx,user.id,sid);
        const rows=await tx.sessions.findMany({where:{user_id:user.id,valid:true,expires_at:{gt:new Date()}},select:{id:true,ip_address:true,user_agent:true,create_date:true,update_date:true,expires_at:true},orderBy:{update_date:'desc'}});
        return rows.map(row=>({...row,current:row.id===sid}));
    });
}
async function revoke(userId,sid,target) {
    if(target!=='others' && (!/^[1-9]\d*$/.test(String(target))||Number(target)>2147483647)) fail(400,'Invalid session.');
    return locked(userId,async(tx,user)=>{
        await active(tx,user.id,sid);
        const result=await tx.sessions.updateMany({where:{user_id:user.id,valid:true,id:target==='others'?{not:sid}:Number(target)},data:{valid:false,update_date:new Date()}});
        return {revoked:result.count,currentRevoked:target!=='others'&&Number(target)===sid};
    });
}
async function changePassword(userId,sid,input) {
    password(input.newPassword);
    if(typeof input.currentPassword!=='string'||Buffer.byteLength(input.currentPassword,'utf8')>72) fail(400,'Enter your current password.');
    return locked(userId,async(tx,user)=>{
        await active(tx,user.id,sid);
        if(!await bcrypt.compare(input.currentPassword,user.password)) fail(400,'Your current password is incorrect.');
        if(await bcrypt.compare(input.newPassword,user.password)) fail(400,'Choose a different password.');
        await tx.users.update({where:{id:user.id},data:{password:await bcrypt.hash(input.newPassword,10),update_date:new Date()}});
        await tx.sessions.updateMany({where:{user_id:user.id,valid:true},data:{valid:false,update_date:new Date()}});
        await tx.tokens.updateMany({where:{user_id:user.id,valid:true},data:{valid:false}});
        await Notifications.createNotification('Your password was changed. All sessions have been signed out. If this was not you, recover your password and contact support.',user.id,tx,'security');
        return {message:'Password changed. Sign in again with your new password.'};
    });
}
async function resetPassword(token,newPassword) {
    password(newPassword);
    let decoded;try {decoded=jwt.verify(token,process.env.JWT_SECRET,{algorithms:['HS256']});} catch {fail(400,'The reset link is invalid or expired.');}
    if(decoded.purpose!=='password-reset'||!Number.isInteger(decoded.id)) fail(400,'The reset link is invalid or expired.');
    return locked(decoded.id,async(tx,user)=>{
        if(decoded.version!==version(user)) fail(400,'This reset link has already been used or is no longer valid.');
        await tx.users.update({where:{id:user.id},data:{password:await bcrypt.hash(newPassword,10),update_date:new Date()}});
        await tx.sessions.updateMany({where:{user_id:user.id,valid:true},data:{valid:false}});
        await tx.tokens.updateMany({where:{user_id:user.id,valid:true},data:{valid:false}});
        await Notifications.createNotification('Your password was reset. All sessions have been signed out. Contact support if you did not request this change.',user.id,tx,'security');
        return {message:'Password reset successfully. Sign in with your new password.'};
    });
}
const resetToken=user=>jwt.sign({id:user.id,purpose:'password-reset',version:version(user)},process.env.JWT_SECRET,{algorithm:'HS256',expiresIn:'15m'});
module.exports={login,refresh,authorize,sessions,revoke,changePassword,resetPassword,resetToken};
