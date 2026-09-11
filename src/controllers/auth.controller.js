const sessions = require('../services/SessionService');
const AuthModel = require('../models/Auth.model');
const { sendResetEmail } = require('../services/NodeMailer');
const logger = require('../Utilities/logger');
const cookieOptions = () => ({httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict'});
const clearCookie = res => res.clearCookie('refreshToken',cookieOptions());
const handle = fn => async(req,res)=>{
    try {return await fn(req,res);} catch(error) {
        if(error.status) return res.status(error.status).json({error:error.message,code:error.code});
        logger.error('Authentication request failed',{requestId:req.requestId,code:error.code||'AUTH_ERROR'});
        return res.status(500).json({error:'Unable to complete this request. Please retry.'});
    }
};
module.exports={
    login:handle(async(req,res)=>{
        const result=await sessions.login(req.body?.email,req.body?.password,{ip:req.ip,agent:req.get?.('user-agent')||req.headers?.['user-agent']});
        res.cookie('refreshToken',result.refreshToken,{...cookieOptions(),expires:result.refreshExpires});
        return res.status(200).json({accessToken:result.accessToken,message:'Login Successful'});
    }),
    refresh:handle(async(req,res)=>{const result=await sessions.refresh(req.cookies?.refreshToken);return res.status(200).json(result);}),
    logout:handle(async(req,res)=>{
        await sessions.revoke(req.user.user.id,req.sessionId,req.sessionId);clearCookie(res);
        return res.status(200).json({message:'Logout successful'});
    }),
    forgotPassword:handle(async(req,res)=>{
        const email=req.body?.email;
        if(typeof email!=='string'||email.length>255) return res.status(400).json({error:'Enter a valid email address.'});
        const result=await AuthModel.findUserByEmailVerified(email.trim());
        if(result.rows[0]) await sendResetEmail(sessions.resetToken(result.rows[0]),email.trim());
        return res.status(200).json({message:'If this address belongs to a verified account, password reset instructions have been sent.'});
    }),
    resetPassword:handle(async(req,res)=>{
        const result=await sessions.resetPassword(req.body?.token,req.body?.password);clearCookie(res);
        return res.status(200).json(result);
    }),
};
