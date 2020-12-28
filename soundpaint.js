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

class SoundPaint {
    constructor(settings) {
        this.debug = typeof settings.debug === "undefined" ? false : settings.debug;
        this.fftsize = typeof settings.fftsize === "undefined" ? Math.pow(2, 12) : settings.fftsize;
        this.sampleRate = typeof settings.sampleRate === "undefined" ? 48000 : settings.sampleRate;
        this.maxFrequency = typeof settings.maxFrequency === "undefined" ? undefined : settings.maxFrequency;
        this.smoothingTimeConstant = typeof settings.smoothingTimeConstant === "undefined" ? 0 : settings.smoothingTimeConstant;

        this.debugLog = $("#logContainer");
        this.binCountLog = $("#binCount");
        this.sampleRateLog = $("#sampleRate");
        this.maxFrequencyLog = $("#maxFrequency");
        this.maxBinsLog = $("#maxBins");
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
        if (this.maxFrequency != undefined) {
            this.maxBins = Math.min(this.binCount, Math.floor(this.maxFrequency / this.binWidth));
        }
        this.maxFrequency = this.indexToAudioFrequency(this.maxBins);

        this.binColours = undefined;
        this.lastStep = undefined;
    }

    init() {
        var colourMap = this.produceColourMap();
        this.binColours = colourMap.map((rgb) => {
            return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        });

        if (this.debug) {
            this.debugLog.removeAttr("hidden");
            this.binCountLog.text(this.binCount);
            this.sampleRateLog.text(this.context.sampleRate);
            this.maxFrequencyLog.text(this.maxFrequency);
            this.maxBinsLog.text(this.maxBins);
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
            this.freqDataLog.text(this.freqDomain.slice(0, this.maxBins).join(" "));
        }

        window.requestAnimationFrame(this.render.bind(this));
    }

    renderOscilloscope(data) {
        let dimensions = Utility.setUpCanvasForHighPPI(this.canvas, this.ctx);
        let width = dimensions.width;
        let height = dimensions.height;

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
        let dimensions = Utility.setUpCanvasForHighPPI(this.blankSlate, this.blankCtx);
        let width = dimensions.width;
        let height = dimensions.height;

        let gap = Math.floor(this.maxBins * 75 / width); // = 5*15px => 1 label each 5x label heights

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
            this.blankCtx.strokeText(Math.floor(i * this.binWidth).toString(), 0, 0);
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
            colours[i] = Utility.nmToRGB(colourWavelength);
        }

        return colours;
    }

    indexToAudioFrequency(index) {
        return Math.floor(this.binWidth * index);
    }

    audioFrequencyToColourWavelength(frequency) {
        return 780 - Math.floor((frequency / this.maxFrequency) * 400);
    }

    indexToColourWavelength(index) {
        return 780 - Math.floor((index / (this.maxBins - 1)) * 400);
    }
}