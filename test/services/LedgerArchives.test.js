const service = require('../../src/services/LedgerArchivesService');
const prisma = require('../../src/prisma/client');
afterEach(() => jest.restoreAllMocks());
test.each([
 {from:'2026-02-30'},{from:'2026-02-01',to:'2026-01-31'},{from:'0000-01-01'},
 {minAmount:'-1'},{maxAmount:'1.001'},{minAmount:'2',maxAmount:'1'},{minAmount:'Infinity'},
 {q:['bad']},{q:'x'.repeat(201)},{category:{}},{accountId:'0'},{before:'1 OR true'}, {type:'invalid'},
])('rejects invalid filters %j',query=>{expect(()=>service.parse(query)).toThrow();});
test('valid filters retain exact decimal amounts and inclusive calendar dates',()=>{
 expect(service.parse({from:'2024-02-29',to:'2024-02-29',minAmount:'0.10',maxAmount:'2',q:'  supplies  '})).toEqual({from:'2024-02-29',to:'2024-02-29',minAmount:'0.10',maxAmount:'2.00',q:'supplies'});
});
test('search text and category are bound parameters, never SQL fragments',()=>{
 const injection="' OR 1=1 --";const sql=service.scope(7,service.parse({q:injection,category:injection,accountId:'12'}));
 expect(sql.text).not.toContain(injection);expect(sql.values).toContain(injection);expect(sql.values).toContain(7);expect(sql.values).toContain(12);
 expect(sql.text).toContain('EXISTS');expect(sql.text).toContain('au.archived = false');expect(sql.text).toContain('a.archived = false');
});
test.each(['=SUM(A1:A2)','+SUM(1,2)','@SUM(1,2)','-formula',' \t=1+1','\n=1+1'])('CSV protects formula-like text %p',value=>{expect(service.cell(value).startsWith('"\'')).toBe(true);});
test('CSV quotes commas, quotes, and newlines while retaining numeric negatives',()=>{
 expect(service.cell('a,"b"\nc')).toBe('"a,""b""\nc"');expect(service.cell('-20.05',false)).toBe('"-20.05"');
});
test('CSV refuses oversized exports rather than silently truncating',async()=>{
 jest.spyOn(prisma,'$queryRaw').mockResolvedValue(Array(10001).fill({}));await expect(service.exportCsv(7,{})).rejects.toMatchObject({status:413});
});
test('CSV ignores pagination and exports all matching entries with exact cents',async()=>{
 const query=jest.spyOn(prisma,'$queryRaw').mockResolvedValue([{id:1,accountId:12,accountName:'=formula',description:'Supplies',category:'Trade',amount:'-0.10',createdAt:new Date('2026-01-01T00:00:00Z'),transferId:null}]);
 const csv=await service.exportCsv(7,{before:'2'});expect(csv).toContain('"-0.10"');expect(csv).toContain("' =formula".replace(' ',''));expect(query.mock.calls[0][0].text).not.toContain('t.id <');
});
test('paging excludes the cursor from reports and uses a consistent snapshot',async()=>{
 const total={count:60,income:'100.10',spending:'20.05',net:'80.05',transferEntries:2};
 const tx={$queryRaw:jest.fn().mockResolvedValueOnce(Array.from({length:51},(_,i)=>({id:99-i,amount:'1.00'}))).mockResolvedValueOnce([total]).mockResolvedValueOnce([]).mockResolvedValueOnce([])};
 const transaction=jest.spyOn(prisma,'runTransaction').mockImplementation(cb=>cb(tx));
 const result=await service.search(7,{before:'100'});
 expect(result.entries).toHaveLength(50);expect(result.nextCursor).toBe(50);expect(result.totals.net).toBe('80.05');
 expect(tx.$queryRaw.mock.calls[0][0].text).toContain('t.id <');expect(tx.$queryRaw.mock.calls[1][0].text).not.toContain('t.id <');
 expect(transaction.mock.calls[0][1].isolationLevel).toBe('RepeatableRead');
});
