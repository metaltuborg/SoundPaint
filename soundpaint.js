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
        statusDiv.text("Listening...");
        onCapture(successVal);
    }, failureVal => {
        statusDiv.text("Failed to capture the mic: [" + failureVal + "]");
    })
}

function gotStream(stream) {
    var painter = new SoundPaint(painterSettings);
    painter.source = painter.context.createMediaStreamSource(stream);
    painter.source.connect(painter.analyser);
    painter.init();
}

let AudioContext = window.AudioContext || window.webkitAudioContext || window.mozAudioContext;
let NoteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

class SoundPaint {
    constructor(settings) {
        this.debug = typeof settings.debug === "undefined" ? false : settings.debug;
        // Resolution of the spectrum analyser. Must be a power of 2.
        // The frequency bin count is half of this resolution.
        this.fftsize = typeof settings.fftsize === "undefined" ? Math.pow(2, 12) : settings.fftsize;
        this.smoothingTimeConstant = typeof settings.smoothingTimeConstant === "undefined" ? 0 : settings.smoothingTimeConstant;
        this.sampleRate = typeof settings.sampleRate === "undefined" ? 48000 : settings.sampleRate;

        this.debugLog = $("#logContainer");
        this.binCountLog = $("#binCount");
        this.sampleRateLog = $("#sampleRate");
        this.maxFrequencyLog = $("#maxFrequency");
        this.deltaLog = $("#delta");
        this.freqDataLog = $("#freqData");
        this.canvas = $("#canvas")[0];
        this.ctx = this.canvas.getContext('2d');

        this.context = new AudioContext({sampleRate: this.sampleRate});
        this.analyser = this.context.createAnalyser();
        this.analyser.smoothingTimeConstant = this.smoothingTimeConstant;
        this.analyser.fftSize = this.fftsize;

        this.binCount = this.analyser.frequencyBinCount;
        this.freqDomain = new Uint8Array(this.binCount);
        this.nyquist = this.context.sampleRate / 2;
        this.binWidth = this.nyquist / this.binCount;

        this.maxFrequency = undefined;
        this.colours = undefined;
        this.lastStep = undefined;
    }

    init() {
        this.maxFrequency = this.indexToAudioFrequency(this.binCount - 1);
        this.colours = this.produceColourMap();

        if (this.debug) {
            this.debugLog.removeAttr("hidden");
            this.binCountLog.text(this.binCount);
            this.sampleRateLog.text(this.context.sampleRate);
            this.maxFrequencyLog.text(this.maxFrequency);
        }

        this.render();
    }

    render(timestamp) {
        this.analyser.getByteFrequencyData(this.freqDomain);
        this.renderOscilloscope(this.freqDomain);

        if (this.debug) {
            if (timestamp != undefined && this.lastStep != undefined) {
                this.deltaLog.text(timestamp - this.lastStep);
            }
            this.lastStep = timestamp;
            this.freqDataLog.text(this.freqDomain.join(" "));
        }

        window.requestAnimationFrame(this.render.bind(this));
    }

    renderOscilloscope(data) {
        let width = this.canvas.width;
        let height = this.canvas.height;

        this.ctx.fillStyle = "rgb(32, 32, 32)";
        this.ctx.fillRect(0, 0, width, height);

        var barWidth = (width / this.binCount) * 2.5;
        var barHeight;
        var x = 0;

        for (var i = 0; i < this.binCount; i++) {
            barHeight = data[i];

            // this.ctx.fillStyle = 'rgb(' + (barHeight + 100) + ',50,50)';
            this.ctx.fillStyle = this.colours[i];
            this.ctx.fillRect(x, height - barHeight / 2, barWidth, barHeight / 2);

            x += barWidth;
        }
    }

    produceColourMap() {
        var colours = [this.binCount];
        for (var i = 0; i < this.binCount; i++) {
            // let audioFrequency = this.indexToAudioFrequency(i);
            // let colourWavelength = this.audioFrequencyToColourWavelength(audioFrequency);
            let colourWavelength = this.indexToColourWavelength(i);
            let colour = this.nmToRGB(colourWavelength);
            colours[i] = `rgb(${colour[0]},${colour[1]},${colour[2]})`;
        }

        return colours;
    }

    indexToAudioFrequency(index) {
        return Math.round(this.binWidth * index);
    }

    audioFrequencyToColourWavelength(frequency) {
        return 780 - Math.round(this.transform(frequency / this.maxFrequency) * 400 /* = 780 - 380 */);
    }

    indexToColourWavelength(index) {
        return 780 - Math.round(this.transform(index / (this.binCount-1)) * 400 /* = 780 - 380 */);
    }

    transform(input) {
        let t1 = 0.9954668;
        let t2 = 0.9953756;
        let t3 = 7.659294;
        return t1 - t2 * Math.pow(Math.E, -t3 * input);
    }

    nmToRGB(wavelength) {
        var Gamma = 0.80,
            IntensityMax = 255,
            factor, red, green, blue;
        if ((wavelength >= 380) && (wavelength < 440)) {
            red = -(wavelength - 440) / (440 - 380);
            green = 0.0;
            blue = 1.0;
        } else if ((wavelength >= 440) && (wavelength < 490)) {
            red = 0.0;
            green = (wavelength - 440) / (490 - 440);
            blue = 1.0;
        } else if ((wavelength >= 490) && (wavelength < 510)) {
            red = 0.0;
            green = 1.0;
            blue = -(wavelength - 510) / (510 - 490);
        } else if ((wavelength >= 510) && (wavelength < 580)) {
            red = (wavelength - 510) / (580 - 510);
            green = 1.0;
            blue = 0.0;
        } else if ((wavelength >= 580) && (wavelength < 645)) {
            red = 1.0;
            green = -(wavelength - 645) / (645 - 580);
            blue = 0.0;
        } else if ((wavelength >= 645) && (wavelength < 781)) {
            red = 1.0;
            green = 0.0;
            blue = 0.0;
        } else {
            red = 0.0;
            green = 0.0;
            blue = 0.0;
        };
        // Let the intensity fall off near the vision limits
        if ((wavelength >= 380) && (wavelength < 420)) {
            factor = 0.3 + 0.7 * (wavelength - 380) / (420 - 380);
        } else if ((wavelength >= 420) && (wavelength < 701)) {
            factor = 1.0;
        } else if ((wavelength >= 701) && (wavelength < 781)) {
            factor = 0.3 + 0.7 * (780 - wavelength) / (780 - 700);
        } else {
            factor = 0.0;
        };
        if (red !== 0) {
            red = Math.round(IntensityMax * Math.pow(red * factor, Gamma));
        }
        if (green !== 0) {
            green = Math.round(IntensityMax * Math.pow(green * factor, Gamma));
        }
        if (blue !== 0) {
            blue = Math.round(IntensityMax * Math.pow(blue * factor, Gamma));
        }
        return [red, green, blue];
    }

    noteFromPitch(frequency) {
        var noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
        return NoteStrings[(Math.round(noteNum) + 69) % 12];
    }
}