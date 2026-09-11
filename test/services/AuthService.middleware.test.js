const auth=require('../../src/services/AuthService');
const sessions=require('../../src/services/SessionService');
const response=()=>({status:jest.fn().mockReturnThis(),json:jest.fn().mockReturnThis()});
afterEach(()=>jest.restoreAllMocks());
test('missing bearer token is rejected',async()=>{const res=response();await auth.authenticateToken({headers:{}},res,jest.fn());expect(res.status).toHaveBeenCalledWith(401);});
test('revoked or expired sessions cannot call next',async()=>{jest.spyOn(sessions,'authorize').mockRejectedValue({status:401,message:'Revoked'});const res=response(),next=jest.fn();await auth.authenticateToken({headers:{authorization:'Bearer token'}},res,next);expect(res.status).toHaveBeenCalledWith(401);expect(next).not.toHaveBeenCalled();});
test('successful authorization installs fresh identity and session ID',async()=>{jest.spyOn(sessions,'authorize').mockResolvedValue({user:{id:7,email:'a@test.example'},sid:12});const req={headers:{authorization:'Bearer token'}},next=jest.fn();await auth.authenticateToken(req,response(),next);expect(req.user).toEqual({user:{id:7,email:'a@test.example'}});expect(req.sessionId).toBe(12);expect(next).toHaveBeenCalled();});
test('database failures deny access without reporting an invalid session',async()=>{jest.spyOn(sessions,'authorize').mockRejectedValue(new Error('db'));const res=response();await auth.authenticateToken({headers:{authorization:'Bearer token'}},res,jest.fn());expect(res.status).toHaveBeenCalledWith(503);});
