// generate.js
var spawn = require('child_process').spawn;
var path = require('path');
var fs = require('fs');

function generateAudiobook(bookTitle, textContent, callback) {
    var pythonExe = path.join(__dirname, '.venv', 'bin', 'python3');
    var outputFolder = path.join(__dirname, 'audiobooks', bookTitle);
    var outputFile = path.join(outputFolder, 'ch1.mp3');

    if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, { recursive: true });
    }

    console.log("Processing: " + bookTitle);

    // Build the arguments as a strict array. No shell interpretation!
    var args = [
        '-n', '19',            // 'nice' priority arguments
        pythonExe,             // The python executable
        '-m', 'pocket_tts',    // The module
        'generate',            // The command
        '--text', textContent, // The exact string, passed securely
        '--output-path', outputFile // The CORRECTED output flag
    ];

    // We execute 'nice' and pass the rest as arguments
    var ttsProcess = spawn('nice', args);

    // Capture standard output
    ttsProcess.stdout.on('data', function(data) {
        // pocket_tts might output standard logs here
        console.log("TTS Log: " + data);
    });

    // Capture standard error (AI models usually print progress bars here!)
    ttsProcess.stderr.on('data', function(data) {
        console.log("TTS Progress: " + data);
    });

    // When the process finishes
    ttsProcess.on('close', function(code) {
        if (code === 0) {
            console.log("Success! Audio saved to: " + outputFile);
        } else {
            console.error("Process failed with code: " + code);
        }
    	callback();
    });
}

module.exports = {
    generateAudiobook: generateAudiobook
};
