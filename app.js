var express = require('express');
var fs = require('fs');
var path = require('path');
var tts = require('./generate.js');
var app = express();
var port = 3000;

var audiobooksDir = path.join(__dirname, 'audiobooks');

// Ensure directory exists
if (!fs.existsSync(audiobooksDir)) {
    fs.mkdirSync(audiobooksDir);
}

app.use(express.static('public'));
app.use('/audiobooks', express.static(audiobooksDir));
app.use(express.json());


// API to list books and their chapters
app.get('/api/books', function(req, res) {
    var books = [];
    var bookFolders = fs.readdirSync(audiobooksDir);

    bookFolders.forEach(function(folder) {
        var fullPath = path.join(audiobooksDir, folder);
        if (fs.lstatSync(fullPath).isDirectory()) {
            var files = fs.readdirSync(fullPath);
            var chapters = files.filter(function(f) { return f.endsWith('.mp3'); }).sort();
            books.push({
                title: folder,
                thumbnail: '/audiobooks/' + folder + '/thumbnail.png',
                chapters: chapters
            });
        }
    });
    res.json(books);
});


// Add this to app.js
var jobQueue = [];
var isProcessing = false;
var tts = require('./generate.js'); 

function processNextJob() {
    // If we are currently running a job, or the queue is empty, do nothing
    if (isProcessing || jobQueue.length === 0) {
        return;
    }

    isProcessing = true;
    var nextJob = jobQueue.shift(); // Grab the oldest job

    console.log("Starting job from queue: " + nextJob.title);

    // We need to modify generateAudiobook to take a callback
    tts.generateAudiobook(nextJob.title, nextJob.text, function() {
        console.log("Finished job: " + nextJob.title);
        isProcessing = false;
        processNextJob(); // Recursively call the next one
    });
}

// Update your route to push to the queue instead of running directly
app.post('/api/generate', express.json(), function(req, res) {
    var title = req.body.title;
    var text = req.body.text; 
	
	if (!title || !text) {
        return res.status(400).send("Missing title or content");
    }
	
    jobQueue.push({ title: title, text: text });
    
    // Attempt to start the queue (will be ignored if already running)
    processNextJob();

    res.send("Added to queue. Position: " + jobQueue.length);
});


app.listen(port, function() {
    console.log('Server running at http://localhost:' + port);
});
