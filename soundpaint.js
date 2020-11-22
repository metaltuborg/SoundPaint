$(document).ready(function () {
    acquireAudioStream($("#micStatus"), gotStream);
});

function acquireAudioStream(statusDiv, onCapture) {
    // Older browsers might not implement mediaDevices at all, so we set an empty object first
    if (navigator.mediaDevices === undefined) {
        navigator.mediaDevices = {};
    }

    // Some browsers partially implement mediaDevices. We can't just assign an object
    // with getUserMedia as it would overwrite existing properties.
    // Here, we will just add the getUserMedia property if it's missing.
    if (navigator.mediaDevices.getUserMedia === undefined) {
        navigator.mediaDevices.getUserMedia = function (constraints) {
            // First get ahold of the legacy getUserMedia, if present
            var getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

            // Some browsers just don't implement it - return a rejected promise with an error
            // to keep a consistent interface
            if (!getUserMedia) {
                return Promise.reject(new Error('getUserMedia is not implemented in this browser'));
            }

            // Otherwise, wrap the call to the old navigator.getUserMedia with a Promise
            return new Promise(function (resolve, reject) {
                getUserMedia.call(navigator, constraints, resolve, reject);
            });
        }
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then(successVal => {
        statusDiv.text("Captured the mic!");
        onCapture(successVal);
    }, failureVal => {
        statusDiv.text("Failed to acquire the mic: [" + failureVal + "]")
    })
}

function gotStream(stream) {
    var painter = new SoundPaint({});
    painter.source = painter.context.createMediaStreamSource(stream);
    painter.source.connect(painter.analyser);
    painter.init();
}

var AudioContext = window.AudioContext || window.webkitAudioContext || window.mozAudioContext;

class SoundPaint {
    constructor(settings) {
        // Resolution of the spectrum analyser. Must be a power of 2.
        // The frequency bin count is half of this resolution.
        this.fftsize = typeof settings.fftsize === "undefined" ? Math.pow(2, 12) : settings.fftsize;
        this.smoothingTimeConstant = typeof settings.smoothingTimeConstant === "undefined" ? 0 : settings.smoothingTimeConstant;

        this.binCountLog = $("#binCount");
        this.deltaLog = $("#delta");
        this.freqDataLog = $("#freqData");
        this.canvas = $("#canvas")[0];
        this.ctx = this.canvas.getContext('2d');

        this.context = new AudioContext();
        this.analyser = this.context.createAnalyser();
        this.analyser.smoothingTimeConstant = this.smoothingTimeConstant;
        this.analyser.fftSize = this.fftsize;
        this.binCount = this.analyser.frequencyBinCount;
        this.freqDomain = new Uint8Array(this.binCount);

        this.lastStep = undefined;
    }

    init() {
        this.binCountLog.text(this.binCount);
        this.render();
    }

    render(timestamp) {
        if (timestamp != undefined && this.lastStep != undefined) {
            this.deltaLog.text(timestamp - this.lastStep);
        }
        this.lastStep = timestamp;

        this.analyser.getByteFrequencyData(this.freqDomain);
        this.freqDataLog.text(this.freqDomain.join(" "));

        this.renderOscilloscope(this.freqDomain);

        window.requestAnimationFrame(this.render.bind(this));
    }

    renderOscilloscope(data) {
        this.ctx.fillStyle = "rgb(200, 200, 200)";
        this.ctx.fillRect(0, 0, canvas.width, canvas.height);

        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = "rgb(0, 0, 0)";

        this.ctx.beginPath();

        var sliceWidth = canvas.width * 1.0 / this.binCount;
        var x = 0;

        for (var i = 0; i < this.binCount; i++) {
            var v = data[i] / 128.0;
            var y = v * canvas.height / 2;

            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }

            x += sliceWidth;
        }

        this.ctx.lineTo(canvas.width, canvas.height / 2);
        this.ctx.stroke();
    }
}