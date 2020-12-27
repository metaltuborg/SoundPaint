$(document).ready(function() {
    acquireAudioStream($("#micStatus"), gotStream);
});

function acquireAudioStream(statusDiv, onCapture) {
    if (navigator.mediaDevices === undefined) {
        navigator.mediaDevices = {};
    }

    if (navigator.mediaDevices.getUserMedia === undefined) {
        navigator.mediaDevices.getUserMedia = function(constraints) {
            var getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
            if (!getUserMedia) {
                return Promise.reject(new Error('getUserMedia is not implemented in this browser'));
            }

            return new Promise(function(resolve, reject) {
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
        this.fftsize = typeof settings.fftsize === "undefined" ? Math.pow(2, 12) : settings.fftsize;
        this.smoothingTimeConstant = typeof settings.smoothingTimeConstant === "undefined" ? 0 : settings.smoothingTimeConstant;
        this.sampleRate = typeof settings.sampleRate === "undefined" ? 48000 : settings.sampleRate;
        this.maxFrequency = typeof settings.maxFrequency === "undefined" ? undefined : settings.maxFrequency;

        this.debugLog = $("#logContainer");
        this.binCountLog = $("#binCount");
        this.sampleRateLog = $("#sampleRate");
        this.maxFrequencyLog = $("#maxFrequency");
        this.deltaLog = $("#delta");
        this.cameraPosLog = $("#cameraPos");
        this.freqDataLog = $("#freqData");

        this.canvas = $("#canvas")[0];
        this.ctx = this.canvas.getContext('2d');
        this.blankSlate = $("#blankSlate")[0];
        this.blankCtx = this.blankSlate.getContext('2d');
        this.colourMapContainer = $("#colourMap");

        this.context = new AudioContext({ sampleRate: this.sampleRate });
        this.analyser = this.context.createAnalyser();
        this.analyser.smoothingTimeConstant = this.smoothingTimeConstant;
        this.analyser.fftSize = this.fftsize;

        this.binCount = this.analyser.frequencyBinCount;
        this.freqDomain = new Uint8Array(this.binCount);
        this.nyquist = this.context.sampleRate / 2;
        this.binWidth = this.nyquist / this.binCount;
        this.maxBins = this.binCount;

        this.binColours = undefined;
        this.lastStep = undefined;
    }

    init() {
        if (this.maxFrequency != undefined) {
            this.maxBins = Math.round(this.maxFrequency / this.binWidth);
        } else {
            this.maxFrequency = this.indexToAudioFrequency(this.binCount - 1);
        }

        var colourMap = this.produceColourMap();
        this.binColours = colourMap.map((rgb) => {
            return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        });

        if (this.debug) {
            this.debugLog.removeAttr("hidden");
            this.binCountLog.text(this.binCount);
            this.sampleRateLog.text(this.context.sampleRate);
            this.maxFrequencyLog.text(this.maxFrequency);
            this.renderColourMap(colourMap);
        }

        this.renderBlankSlate();
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
        this.canvas.width = this.canvas.clientWidth * window.devicePixelRatio;
        this.canvas.height = this.canvas.clientHeight * window.devicePixelRatio;
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        let width = this.canvas.clientWidth;
        let height = this.canvas.clientHeight;

        this.ctx.fillStyle = "rgb(32, 32, 32)";
        this.ctx.fillRect(0, 0, width, height);

        var barWidth = (width / this.maxBins);
        var barHeight;
        var x = 0;

        for (var i = 0; i < this.maxBins; i++) {
            barHeight = data[i];

            this.ctx.fillStyle = this.binColours[i];
            this.ctx.fillRect(x, height * (1 - barHeight / 255), barWidth, height * barHeight / 255);

            x += barWidth;
        }
    }

    renderBlankSlate() {
        this.blankSlate.width = this.blankSlate.clientWidth * window.devicePixelRatio;
        this.blankSlate.height = this.blankSlate.clientHeight * window.devicePixelRatio;
        this.blankCtx.scale(window.devicePixelRatio, window.devicePixelRatio);

        let width = this.blankSlate.clientWidth;
        let height = this.blankSlate.clientHeight;
        let gap = Math.round(this.maxBins * 75 / width); // = 5*15px => 1 label each 5x label heights

        this.blankCtx.fillStyle = "rgb(32, 32, 32)";
        this.blankCtx.fillRect(0, 0, width, height);
        this.blankCtx.font = "15px Georgia";

        var barWidth = (width / this.maxBins);
        var x = 0;

        for (var i = 0; i < this.maxBins; i++) {
            this.blankCtx.fillStyle = this.binColours[i];
            this.blankCtx.fillRect(x, 0, barWidth, height);
            x += barWidth;
        }
        for (var i = 0; i < this.maxBins; i += gap) {
            this.blankCtx.save();
            this.blankCtx.translate(i * barWidth + 10, height - 5);
            this.blankCtx.rotate(-0.5 * Math.PI);
            this.blankCtx.strokeStyle = "rgb(255, 255, 255)";
            this.blankCtx.strokeText(Math.round(i * this.binWidth).toString(), 0, 0);
            this.blankCtx.restore();
        }
    }

    renderColourMap(binColours) {
        var data = new vis.DataSet();
        binColours.forEach((rgb, i) => {
            data.add({
                x: rgb[0],
                y: rgb[1],
                z: rgb[2],
                style: i,
            });
        });

        var options = {
            width: '100%',
            height: '800px',
            xCenter: '50%',
            style: 'dot-color',
            showPerspective: true,
            showGrid: true,
            showShadow: false,
            keepAspectRatio: true,
            verticalRatio: 1,
            backgroundColor: {
                fill: 'rgb(191, 191, 191)',
            },
            xLabel: 'R',
            yLabel: 'G',
            zLabel: 'B',
            cameraPosition: {
                horizontal: 0.845,
                vertical: 0.145,
                distance: 3.657,
            },
        };

        this.colourMapContainer.removeAttr("hidden");
        var graph3d = new vis.Graph3d(this.colourMapContainer[0], data, options);
        graph3d.on('cameraPositionChange', (e) => { this.cameraPosLog.text([e.horizontal, e.vertical, e.distance]) });
    }

    produceColourMap() {
        var colours = [this.maxBins];

        for (var i = 0; i < this.maxBins; i++) {
            let colourWavelength = this.indexToColourWavelength(i);
            colours[i] = this.nmToRGB(colourWavelength);
        }

        return colours;
    }

    indexToAudioFrequency(index) {
        return Math.round(this.binWidth * index);
    }

    audioFrequencyToColourWavelength(frequency) {
        return 780 - Math.round((frequency / this.maxFrequency) * 400);
    }

    indexToColourWavelength(index) {
        return 780 - Math.round((index / (this.maxBins - 1)) * 400);
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