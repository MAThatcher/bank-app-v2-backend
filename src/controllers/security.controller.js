const service=require('../services/SessionService');
const handle=fn=>async(req,res)=>{
    try { return await fn(req,res); } catch(error) {
        return res.status(error.status||500).json({error:error.status?error.message:'The security request could not be confirmed. Refresh before trying again.'});
    }
};
const clear=res=>res.clearCookie('refreshToken',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict'});
module.exports={
    list:handle(async(req,res)=>res.json(await service.sessions(req.user.user.id,req.sessionId))),
    revoke:handle(async(req,res)=>{const result=await service.revoke(req.user.user.id,req.sessionId,req.params.sessionId);if(result.currentRevoked)clear(res);return res.json(result);}),
    others:handle(async(req,res)=>res.json(await service.revoke(req.user.user.id,req.sessionId,'others'))),
    changePassword:handle(async(req,res)=>{const result=await service.changePassword(req.user.user.id,req.sessionId,req.body||{});clear(res);return res.json(result);}),
};
