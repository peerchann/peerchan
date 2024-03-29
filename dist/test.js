test('open, write file, close, reopen, read file', async () => {
  
  const db = require('./db.js')




  let dataArray = new Uint8Array([1, 2, 3, 4, 5])

  let hash = await db.putFile([dataArray, 'testboard'])

  let result = await db.getFile(hash, 'testboard')



  expect(result).toEqual(dataArray);




  expect(1+1).toBe(2);
});
