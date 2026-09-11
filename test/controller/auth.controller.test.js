const sessions=require('../../src/services/SessionService');
const controller=require('../../src/controllers/auth.controller');
const model=require('../../src/models/Auth.model');
const response=()=>{const res={};for(const method of ['status','json','cookie','clearCookie'])res[method]=jest.fn().mockReturnValue(res);return res;};
afterEach(()=>jest.restoreAllMocks());
test('login returns the access token only after session creation commits',async()=>{
 let release;const pending=new Promise(resolve=>{release=resolve;});jest.spyOn(sessions,'login').mockReturnValue(pending);
 const res=response();const call=controller.login({body:{email:'a@test.example',password:'password'},ip:'127.0.0.1',headers:{}},res);
 await Promise.resolve();expect(res.cookie).not.toHaveBeenCalled();
 const expiry=new Date('2026-09-12T00:00:00Z');release({accessToken:'access',refreshToken:'refresh',refreshExpires:expiry});await call;
 expect(res.cookie).toHaveBeenCalledWith('refreshToken','refresh',expect.objectContaining({httpOnly:true,sameSite:'strict',expires:expiry}));
 expect(res.json).toHaveBeenCalledWith({accessToken:'access',message:'Login Successful'});
});
test.each([401,500])('login errors return %s without setting a cookie',async status=>{jest.spyOn(sessions,'login').mockRejectedValue(status===401?{status,message:'Invalid email or password.'}:new Error('db'));const res=response();await controller.login({body:{}},res);expect(res.status).toHaveBeenCalledWith(status);expect(res.cookie).not.toHaveBeenCalled();});
test('unknown reset email returns a neutral success',async()=>{jest.spyOn(model,'findUserByEmailVerified').mockResolvedValue({rows:[]});const res=response();await controller.forgotPassword({body:{email:'unknown@test.example'}},res);expect(res.status).toHaveBeenCalledWith(200);});
test('reset email uses a scoped token without a password claim',async()=>{jest.spyOn(model,'findUserByEmailVerified').mockResolvedValue({rows:[{id:7,password:'hash'}]});const token=jest.spyOn(sessions,'resetToken').mockReturnValue('reset-token');const res=response();await controller.forgotPassword({body:{email:'known@test.example'}},res);expect(token).toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(200);});
test('password reset clears the browser refresh cookie',async()=>{jest.spyOn(sessions,'resetPassword').mockResolvedValue({message:'Reset'});const res=response();await controller.resetPassword({body:{token:'reset',password:'new-password'}},res);expect(res.clearCookie).toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(200);});
test('invalid reset returns an input error',async()=>{jest.spyOn(sessions,'resetPassword').mockRejectedValue({status:400,message:'Expired'});const res=response();await controller.resetPassword({body:{}},res);expect(res.status).toHaveBeenCalledWith(400);});
test('logout revokes the authenticated session rather than trusting a cookie',async()=>{const revoke=jest.spyOn(sessions,'revoke').mockResolvedValue({currentRevoked:true});const res=response();await controller.logout({user:{user:{id:7}},sessionId:12,cookies:{refreshToken:'unrelated'}},res);expect(revoke).toHaveBeenCalledWith(7,12,12);expect(res.clearCookie).toHaveBeenCalled();});
