import { WebSocketServer } from 'ws';
import { Client } from 'ssh2';
import { readFileSync } from 'fs';

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
  console.log('Client connected');
  let sshConn = null;

  ws.on('message', (message) => {
    const data = JSON.parse(message.toString());
    console.log('Received message:', data);

    if (data.ip && !sshConn) {
      const sshConfig = {
        host: data.ip,
        port: 22,
        username: 'ec2-user',
        privateKey: readFileSync('/home/ec2-user/test.pem'),
      };
      console.log('Attempting SSH to:', sshConfig.host);

      sshConn = new Client();
      sshConn.on('ready', () => {
        console.log('SSH connection established');
        ws.send(JSON.stringify({ output: 'Lab connected. Run commands!' }));
      }).on('error', (err) => {
        console.error('SSH error:', err);
        ws.send(JSON.stringify({ output: 'SSH connection failed: ' + err.message }));
        sshConn = null;
      }).on('close', (hadError) => {
        console.log('SSH connection closed, hadError:', hadError);
        ws.send(JSON.stringify({ output: 'SSH connection closed' }));
      }).connect(sshConfig);
    } else if (data.command && sshConn) {
      console.log('Executing command:', data.command);
      sshConn.exec(data.command, { pty: true }, (err, stream) => {
        if (err) {
          console.error('Exec error:', err);
          ws.send(JSON.stringify({ output: 'Exec error: ' + err.message }));
          return;
        }

        let outputBuffer = '';
        stream.on('data', (data) => {
          outputBuffer += data.toString();
          console.log('Command stdout:', data.toString());
          ws.send(JSON.stringify({ output: data.toString() }));
        }).stderr.on('data', (data) => {
          outputBuffer += data.toString();
          console.log('Command stderr:', data.toString());
          ws.send(JSON.stringify({ output: data.toString() }));
        }).on('close', (code) => {
          console.log('Command completed, exit code:', code);
          if (code && code !== 0) { // Only send if code exists and isn’t 0
            ws.send(JSON.stringify({ output: `Command exited with code ${code}` }));
          }
        }).on('error', (err) => {
          console.error('Stream error:', err);
          ws.send(JSON.stringify({ output: 'Stream error: ' + err.message }));
        });
      });
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    if (sshConn) {
      sshConn.end();
      sshConn = null;
    }
  });
});

console.log('WebSocket server running on port 8080');
