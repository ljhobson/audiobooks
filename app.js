var express = require('express');
var fs = require('fs');
var path = require('path');

var EPub = require('epub2').EPub;
var htmlToText = require('html-to-text');

var multer  = require('multer');
// Save uploaded files to a temporary 'uploads' folder
var upload = multer({ dest: 'uploads/' }); 

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




// The route now uses upload.single('epubFile') as middleware
app.post('/api/upload-book', upload.single('epubFile'), function(req, res) {
    var uploadedFilePath = req.file.path;
    // Now you have the file saved locally, ready to be parsed
    console.log(uploadedFilePath + " has been uploaded.");
    
    parseEpubAndQueue(uploadedFilePath, req.body.title || "Unknown-Book-" + Math.floor(1000000 * Math.random()));
    
    res.send("Book has been fully uploaded and parsed, processing has now started.");
});



function extractCover(epub, bookTitle) {
    // The 'cover' property in metadata is usually the ID of the image
    var coverId = epub.metadata.cover;
    
    if (!coverId) {
        console.log("No cover image found in metadata for: " + bookTitle);
        return;
    }

    // Request the image buffer from the EPUB
    epub.getImage(coverId, function(error, data, mimeType) {
        if (error) {
            console.error("Error extracting cover: " + error);
            return;
        }

        var outputFolder = path.join(__dirname, 'audiobooks', bookTitle);
        
        // Ensure the folder exists
        if (!fs.existsSync(outputFolder)) {
            fs.mkdirSync(outputFolder, { recursive: true });
        }

        // Save the buffer to your thumbnail path
        // Most covers are JPEGs, but saving as thumbnail.png is fine for web display
        var thumbnailPath = path.join(outputFolder, 'thumbnail.png');
        
        fs.writeFile(thumbnailPath, data, function(err) {
            if (err) console.error("Failed to save thumbnail: " + err);
            else console.log("Thumbnail saved for: " + bookTitle);
        });
    });
}


function parseEpubAndQueue(filePath, bookTitle) {
    var epub = new EPub(filePath);
    
    epub.on("end", function() {
    	// Audiobook
    	extractCover(epub, bookTitle);
    
        // epub.flow is an array of all the chapters/sections in order
        var chapters = epub.flow;
        var chapterIndex = 1;

        function processChapter(index) {
            if (index >= chapters.length) return; // Done parsing

            var chapterId = chapters[index].id;
            
            // Extract the raw HTML of the chapter
            epub.getChapter(chapterId, function(error, htmlContent) {
                if (!error && htmlContent) {
                    // Strip the HTML tags to get pure text for the AI
                    var plainText = htmlToText.convert(htmlContent);
                    
                    // Push this specific chapter to your queue
                    jobQueue.push({ 
                        title: bookTitle, 
                        outputName: "Chapter " + chapterIndex, 
                        text: plainText 
                    });
                    
                    processNextJob();
                    
                    chapterIndex++;
                }
                // Process the next chapter
                processChapter(index + 1);
            });
        }

        // Start processing the first chapter
        processChapter(0);
    });

    epub.parse();
}




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
    if (!nextJob.outputName) {
    	nextJob.outputName = "Audio-" + Math.floor(1000000 * Math.random());
    }
    tts.generateAudiobook(nextJob.title, nextJob.text, nextJob.outputName, function() {
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
