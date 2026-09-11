const controller=require('../../src/controllers/auth.controller');
const sessions=require('../../src/services/SessionService');
const response=()=>({status:jest.fn().mockReturnThis(),json:jest.fn().mockReturnThis()});
afterEach(()=>jest.restoreAllMocks());
test('missing refresh cookie requires sign-in',async()=>{const res=response();await controller.refresh({},res);expect(res.status).toHaveBeenCalledWith(401);});
test('invalid refresh token requires sign-in',async()=>{const res=response();await controller.refresh({cookies:{refreshToken:'invalid'}},res);expect(res.status).toHaveBeenCalledWith(401);});
test('refresh waits for persistence and does not confuse database failures with revocation',async()=>{let resolve;const pending=new Promise(done=>{resolve=done;});jest.spyOn(sessions,'refresh').mockReturnValueOnce(pending).mockRejectedValueOnce(new Error('db'));const res=response();const call=controller.refresh({cookies:{refreshToken:'valid'}},res);await Promise.resolve();expect(res.json).not.toHaveBeenCalled();resolve({accessToken:'new'});await call;expect(res.json).toHaveBeenCalledWith({accessToken:'new'});const failed=response();await controller.refresh({cookies:{refreshToken:'valid'}},failed);expect(failed.status).toHaveBeenCalledWith(500);});
