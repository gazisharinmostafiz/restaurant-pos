
const http = require('http');
const bcrypt = require('bcrypt');

const saltRounds = 10;
const password = '1234';

bcrypt.hash(password, saltRounds, (err, hashedPassword) => {
  if (err) {
    console.error('Error hashing password:', err);
    return;
  }

  const postData = JSON.stringify({
    'username': 'admin',
    'password': hashedPassword
  });

  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      console.log(`BODY: ${chunk}`);
    });
    res.on('end', () => {
      console.log('No more data in response.');
    });
  });

  req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
  });

  // write data to request body
  req.write(postData);
  req.end();
});
