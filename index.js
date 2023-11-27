const { Client, MessageMedia, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fs = require('fs');
const fileUpload = require('express-fileupload');
const axios = require('axios');
const mongoose = require('mongoose');
const Message = require('./models/index.js');
const bodyParser = require('body-parser');
const port = process.env.PORT || 8000;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(bodyParser.urlencoded({extended:true}));
app.use(bodyParser.json());
app.use(express.static('pic'));

mongoose.connect('mongodb+srv://lisa:p12121515@cluster0.sxzgza4.mongodb.net/new?retryWrites=true&w=majority',{useUnifiedTopology:true,useNewUrlParser:true});
const connection = mongoose.connection;

connection.once('open',()=>{
    console.log('connection is ready');
});

app.set('view engine','ejs');

app.use(express.json());
app.use(express.urlencoded({extended: true}));

/**
 * BASED ON MANY QUESTIONS
 * Actually ready mentioned on the tutorials
 * 
 * The two middlewares above only handle for data json & urlencode (x-www-form-urlencoded)
 * So, we need to add extra middleware to handle form-data
 * Here we can use express-fileupload
 */
app.use(fileUpload({
  debug: false
}));

app.get('/', (req, res) => {
  res.sendFile('index.html', {
    root: __dirname
  });
});

app.post('/insert',(req,res)=>{
  let message = new Message({
      key:req.body.key,
      meg:req.body.meg
  })
  if(message.key&&message.meg){
    message.save()
    res.redirect('/show');
  }else{
    res.redirect('/insert'); 
  }
});

app.post('/file',(req,res)=>{
  if(req.files){
      var file = req.files.file;
      var ext = file.name.split('.').pop();
      if(ext == 'jpg' | ext == 'mp4'){
      file.mv('./pic/'+file.name,(err)=>{
          res.redirect('/insert');
      });
      }else{
          res.redirect('/insert');
      }
  }else{
      res.redirect('/insert');
  };
});

app.get('/insert',(req,res)=>{
  fs.readdir('./pic',(err,data)=>{
      res.render('insert',{file:data});
  });
});

app.get('/number',(req,res)=>{
  fs.readFile('./number.txt',(err,data)=>{
      res.render('number',{number:data});
  });
});

app.get('/fdel/:id',async(req,res)=>{
  var del = req.params.id;
  fs.unlink('./pic/'+del,(err)=>{
      if(err) throw err;
      res.redirect('/insert');
  })
});

app.get('/show',async(req,res)=>{
 var result = await Message.find();
  res.render('show',{meg:result});
});
app.get('/delete/:id',async(req,res)=>{
  await Message.findByIdAndDelete(req.params.id);
  res.redirect('/show');
});
app.get('/edit/:id',async(req,res)=>{
  var result = await Message.findById(req.params.id);
   res.render('edit',{meg:result});
});
app.post('/update/:id',async(req,res)=>{
  await Message.findByIdAndUpdate(req.params.id,req.body);
  res.redirect('/show');
});

const sessions = [];
const SESSIONS_FILE = './whatsapp-sessions.json';

const createSessionsFileIfNotExists = function() {
  if (!fs.existsSync(SESSIONS_FILE)) {
    try {
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify([]));
      console.log('Sessions file created successfully.');
    } catch(err) {
      console.log('Failed to create sessions file: ', err);
    }
  }
}

createSessionsFileIfNotExists();

const setSessionsFile = function(sessions) {
  fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions), function(err) {
    if (err) {
      console.log(err);
    }
  });
}

const getSessionsFile = function() {
  return JSON.parse(fs.readFileSync(SESSIONS_FILE));
}

const createSession = function(id, description) {
  console.log('Creating session: ' + id);
  const client = new Client({
    restartOnAuthFail: false,
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process', // <- this one doesn't works in Windows
        '--disable-gpu'
      ],
      //executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      //product: 'chrome',
    },
    authStrategy: new LocalAuth({
      clientId: id
    })
  });

  client.initialize();

  client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.toDataURL(qr, (err, url) => {
      io.emit('qr', { id: id, src: url });
      io.emit('message', { id: id, text: 'QR Code received, scan please!' });
    });
  });

  client.on('ready', () => {
    io.emit('ready', { id: id });
    io.emit('message', { id: id, text: 'Whatsapp is ready!' });

    const savedSessions = getSessionsFile();
    const sessionIndex = savedSessions.findIndex(sess => sess.id == id);
    savedSessions[sessionIndex].ready = true;
    setSessionsFile(savedSessions);
  });

  client.on('authenticated', () => {
    io.emit('authenticated', { id: id });
    io.emit('message', { id: id, text: 'Whatsapp is authenticated!' });
  });

  client.on('message',async message => {
    var ph = (await message.getContact()).number;
    const mb = message.body.toLowerCase();
    const mm = mb.replace(/[?*()[\\]/g, "");
    var rlt = await Message.findOne({$or:[{'key':{$regex:mm}}]});
    fs.readFile('number.txt','utf-8',(err,data)=>{
        var num = data.split(',');
        var nn = num.findIndex(num => num == ph);
        if(num[nn] !== ph){
            fs.appendFile('number.txt',','+ph,(err)=>{});
        }
    });
    setTimeout(async()=>{
        if(rlt !== null) {
            if(rlt.meg == 'pic1'){
                if(fs.existsSync('./pic/1.jpg')){
                    client.sendMessage(message.from,MessageMedia.fromFilePath('./pic/1.jpg'));
                }
            }else if(rlt.meg == 'pic2'){
                if(fs.existsSync('./pic/2.jpg')){
                    client.sendMessage(message.from,MessageMedia.fromFilePath('./pic/2.jpg'));
                }
            }else if(rlt.meg == 'pic3'){
                if(fs.existsSync('./pic/3.jpg')){
                    client.sendMessage(message.from,MessageMedia.fromFilePath('./pic/3.jpg'));
                }
            }else if(rlt.meg == 'pic4'){
                if(fs.existsSync('./pic/4.jpg')){
                    client.sendMessage(message.from,MessageMedia.fromFilePath('./pic/4.jpg'));
                }
            }else if(rlt.meg == 'pic5'){
                if(fs.existsSync('./pic/5.jpg')){
                    client.sendMessage(message.from,MessageMedia.fromFilePath('./pic/5.jpg'));
                }
            }else if(rlt.meg == 'pic6'){
                if(fs.existsSync('./pic/6.jpg')){
                    client.sendMessage(message.from,MessageMedia.fromFilePath('./pic/6.jpg'));
                }
            }else if(rlt.meg == 'pic7'){
                if(fs.existsSync('./pic/7.jpg')){
                    client.sendMessage(message.from,MessageMedia.fromFilePath('./pic/7.jpg'));
                }
            }else if(rlt.meg == 'pic8'){
                if(fs.existsSync('./pic/8.jpg')){
                    client.sendMessage(message.from,MessageMedia.fromFilePath('./pic/8.jpg'));
                }
            }else if(rlt.meg == 'pic9'){
                if(fs.existsSync('./pic/9.jpg')){
                    client.sendMessage(message.from,MessageMedia.fromFilePath('./pic/9.jpg'));
                }
            }else if(rlt.meg == 'pic10'){
                if(fs.existsSync('./pic/10.jpg')){
                    client.sendMessage(message.from,MessageMedia.fromFilePath('./pic/10.jpg'));
                }
            }else if(rlt.meg == 'vid1'){
                if(fs.existsSync('./pic/1.mp4')){
                    client.sendMessage(message.from,MessageMedia.fromFilePath('./pic/1.mp4'));
                }
            }else if(rlt.meg == 'vid2'){
                if(fs.existsSync('./pic/2.mp4')){
                    client.sendMessage(message.from,MessageMedia.fromFilePath('./pic/2.mp4'));
                }
            }else if(rlt.meg == 'vid3'){
                if(fs.existsSync('./pic/3.mp4')){
                    client.sendMessage(message.from,MessageMedia.fromFilePath('./pic/3.mp4'));
                }
            }else if(rlt.meg == 'vid4'){
                if(fs.existsSync('./pic/4.mp4')){
                    client.sendMessage(message.from,MessageMedia.fromFilePath('./pic/4.mp4'));
                }
            }else if(rlt.meg == 'vid5'){
                if(fs.existsSync('./pic/5.mp4')){
                    client.sendMessage(message.from,MessageMedia.fromFilePath('./pic/5.mp4'));
                }
            }else if(rlt.meg == 'vid6'){
                if(fs.existsSync('./pic/6.mp4')){
                    client.sendMessage(message.from,MessageMedia.fromFilePath('./pic/6.mp4'));
                }
            }else if(rlt.meg == 'vid7'){
                if(fs.existsSync('./pic/7.mp4')){
                    client.sendMessage(message.from,MessageMedia.fromFilePath('./pic/7.mp4'));
                }
            }else if(rlt.meg == 'vid8'){
                if(fs.existsSync('./pic/8.mp4')){
                    client.sendMessage(message.from,MessageMedia.fromFilePath('./pic/8.mp4'));
                }
            }else if(rlt.meg == 'vid9'){
                if(fs.existsSync('./pic/9.mp4')){
                    client.sendMessage(message.from,MessageMedia.fromFilePath('./pic/9.mp4'));
                }
            }else if(rlt.meg == 'vid10'){
                if(fs.existsSync('./pic/10.mp4')){
                    client.sendMessage(message.from,MessageMedia.fromFilePath('./pic/10.mp4'));
                }
            }else{
                client.sendMessage(message.from, rlt.meg);
            }
        }else{
            var fixt = await Message.findOne({key:'fixt'});
            if(fixt !== null) {
            client.sendMessage(message.from, fixt.meg);
            }else{
            client.sendMessage(message.from,'??');
            }
       }
    },10000);
});

  client.on('auth_failure', function() {
    io.emit('message', { id: id, text: 'Auth failure, restarting...' });
  });

  client.on('disconnected', (reason) => {
    io.emit('message', { id: id, text: 'Whatsapp is disconnected!' });
    //client.destroy();
    client.initialize();

    // Menghapus pada file sessions
    const savedSessions = getSessionsFile();
    const sessionIndex = savedSessions.findIndex(sess => sess.id == id);
    savedSessions.splice(sessionIndex, 1);
    setSessionsFile(savedSessions);

    io.emit('remove-session', id);
  });

  // Tambahkan client ke sessions
  sessions.push({
    id: id,
    description: description,
    client: client
  });

  // Menambahkan session ke file
  const savedSessions = getSessionsFile();
  const sessionIndex = savedSessions.findIndex(sess => sess.id == id);

  if (sessionIndex == -1) {
    savedSessions.push({
      id: id,
      description: description,
      ready: false,
    });
    setSessionsFile(savedSessions);
  }
}

const init = function(socket) {
  const savedSessions = getSessionsFile();

  if (savedSessions.length > 0) {
    if (socket) {
      /**
       * At the first time of running (e.g. restarting the server), our client is not ready yet!
       * It will need several time to authenticating.
       * 
       * So to make people not confused for the 'ready' status
       * We need to make it as FALSE for this condition
       */
      savedSessions.forEach((e, i, arr) => {
        arr[i].ready = false;
      });

      socket.emit('init', savedSessions);
    } else {
      savedSessions.forEach(sess => {
        createSession(sess.id, sess.description);
      });
    }
  }
}

init();

// Socket IO
io.on('connection', function(socket) {
  init(socket);

  socket.on('create-session', function(data) {
    console.log('Create session: ' + data.id);
    createSession(data.id, data.description);
  });
});

server.listen(port, function() {
  console.log('App running on *: ' + port);
});
