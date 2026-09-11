const service=require('../../src/services/LedgerLabelsService');
const db=require('../../src/prisma/client');
beforeEach(()=>jest.spyOn(db,'runTransaction'));
afterEach(()=>jest.restoreAllMocks());
test.each([{name:'',color:'#ffffff'},{name:'   ',color:'#ffffff'},{name:'a'.repeat(61),color:'#ffffff'},{name:'Campaign',color:'red'},{name:'Campaign',color:'url(x)'},{name:'Campaign',color:null}])('invalid label values are rejected: %p',async data=>{await expect(service.save(7,'tag',data)).rejects.toMatchObject({status:400});expect(db.runTransaction).not.toHaveBeenCalled();});
test('unknown label kinds are rejected',async()=>{await expect(service.save(7,'admin',{name:'Label',color:'#ffffff'})).rejects.toMatchObject({status:400});});
test.each([{transactionIds:[]},{transactionIds:[1,1],categoryId:null},{transactionIds:Array.from({length:101},(_,i)=>i+1),categoryId:null},{transactionIds:[1]},{transactionIds:[1],categoryId:-1},{transactionIds:[1],addTagIds:[2],removeTagIds:[2]},{transactionIds:[1],addTagIds:[0]},{transactionIds:[1],categoryId:'1 OR 1=1'}])('invalid bulk requests do not start a transaction: %p',async input=>{await expect(service.assign(7,input)).rejects.toMatchObject({status:400});expect(db.runTransaction).not.toHaveBeenCalled();});
