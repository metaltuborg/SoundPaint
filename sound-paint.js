$(document).ready(function() {
    acquireAudioStream($("#micStatus"), gotStream);
});

function acquireAudioStream(statusDiv, onCapture) {
    if (navigator.mediaDevices === undefined) {
        navigator.mediaDevices = {};
    }

    if (navigator.mediaDevices.getUserMedia === undefined) {
        navigator.mediaDevices.getUserMedia = function(constraints) {
            const getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
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
    const painter = new SoundPaint(painterSettings);
    painter.source = painter.context.createMediaStreamSource(stream);
    painter.source.connect(painter.analyser);
    painter.init();
}

const AudioContext = window.AudioContext || window.webkitAudioContext || window.mozAudioContext;
const MinusHalfPi = -0.5 * Math.PI;
const Nero = "rgb(32, 32, 32)";
const White = "rgb(255, 255, 255)";
const BlankSlateGeorgia = "15px Georgia";
const ZScoreInterval = 100;

class SoundPaint {
    constructor(settings) {
        // Infer the setttings.
        this.debug = typeof settings.debug === "undefined" ? false : settings.debug;
        this.fftsize = typeof settings.fftsize === "undefined" ? Math.pow(2, 12) : settings.fftsize;
        this.sampleRate = typeof settings.sampleRate === "undefined" ? 48000 : settings.sampleRate;
        this.maxFrequency = typeof settings.maxFrequency === "undefined" ? undefined : settings.maxFrequency;
        this.smoothingTimeConstant = typeof settings.smoothingTimeConstant === "undefined" ? 0 : settings.smoothingTimeConstant;

        // Set up the audio context & analyser.
        this.context = new AudioContext({ sampleRate: this.sampleRate });
        this.analyser = this.context.createAnalyser();
        this.analyser.smoothingTimeConstant = this.smoothingTimeConstant;
        this.analyser.fftSize = this.fftsize;

        // Set up the frequency domain parameters.
        this.binCount = this.analyser.frequencyBinCount;
        this.freqDomain = new Uint8Array(this.binCount);
        this.nyquist = this.context.sampleRate / 2;
        this.binWidth = this.nyquist / this.binCount;

        this.maxBins = this.binCount;
        if (this.maxFrequency != undefined) {
            this.maxBins = Math.min(this.binCount, Math.floor(this.maxFrequency / this.binWidth));
        }
        this.maxFrequency = this.indexToAudioFrequency(this.maxBins);

        // Set up output containers.
        this.debugLog = $("#logContainer");
        this.binCountLog = $("#binCount");
        this.sampleRateLog = $("#sampleRate");
        this.maxFrequencyLog = $("#maxFrequency");
        this.maxBinsLog = $("#maxBins");
        this.timestampLog = $("#timestamp");
        this.deltaLog = $("#delta");
        this.cameraPosLog = $("#cameraPos");
        this.freqDataLog = $("#freqData");

        this.canvas = new FrequencyDomainCanvas($("#canvas")[0], this.maxBins).init();
        this.signals = new FrequencyDomainCanvas($("#signalsCanvas")[0], this.maxBins).init();
        this.blankSlate = new FrequencyDomainCanvas($("#blankSlate")[0], this.maxBins).init();
        this.colourMapContainer = $("#colourMap");

        // Set up other properties.
        this.scorer = new ZScore({
            lag: 20,
            threshold: 3,
            influence: 0.5,
        });
        this.nextZScoreStep = ZScoreInterval;

        // Declare other properties in advance.
        this.binColours = undefined;
        this.lastStep = undefined;
    }

    init() {
        const colourMap = this.produceColourMap();
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
        let frequencyData = this.freqDomain.slice(0, this.maxBins);

        this.renderOscilloscope(frequencyData);

        // if (timestamp >= this.nextZScoreStep) {
        this.renderSignals(this.scorer.signals(frequencyData));
        // this.nextZScoreStep += ZScoreInterval;
        // }

        if (this.debug) {
            if (timestamp != undefined && this.lastStep != undefined) {
                this.timestampLog.text(timestamp);
                this.deltaLog.text(timestamp - this.lastStep);
            }
            this.lastStep = timestamp;
            this.freqDataLog.text(frequencyData.join(" "));
        }

        window.requestAnimationFrame(this.render.bind(this));
    }

    renderOscilloscope(data) {
        const barHeightFactor = this.canvas.height / 255;

        this.canvas.blank(Nero);

        for (let i = 0, x = 0, barHeight; i < this.maxBins; i++, x += this.canvas.barWidth) {
            barHeight = barHeightFactor * data[i];
            this.canvas.flexbar(x, this.canvas.height - barHeight, this.canvas.barWidth, barHeight, this.binColours[i]);
        }
    }

    renderSignals(data) {
        this.signals.blank(Nero);

        for (let i = 0, x = 0; i < this.maxBins; i++, x += this.signals.barWidth) {
            if (data[i] > 0) {
                this.signals.fullbar(x, this.binColours[i]);
            }
        }
    }

    renderBlankSlate() {
        const gap = Math.floor(this.maxBins * 75 / this.blankSlate.width); // = 5*15px => 1 label each 5x label heights

        this.blankSlate.blank(Nero);
        this.blankSlate.context.font = BlankSlateGeorgia;

        for (let i = 0, x = 0; i < this.maxBins; i++, x += this.blankSlate.barWidth) {
            this.blankSlate.fullbar(x, this.binColours[i]);
        }
        for (let i = 0; i < this.maxBins; i += gap) {
            this.blankSlate.context.save();
            this.blankSlate.context.translate(i * this.blankSlate.barWidth + 10, this.blankSlate.height - 5);
            this.blankSlate.context.rotate(MinusHalfPi);
            this.blankSlate.context.strokeStyle = White;
            this.blankSlate.context.strokeText(Math.floor(i * this.binWidth).toString(), 0, 0);
            this.blankSlate.context.restore();
        }
    }

    renderColourMap(binColours) {
        let data = new vis.DataSet();
        binColours.forEach((rgb, i) => {
            data.add({
                x: rgb[0],
                y: rgb[1],
                z: rgb[2],
                style: Math.floor(i * this.binWidth),
            });
        });

        const options = {
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
        const graph3d = new vis.Graph3d(this.colourMapContainer[0], data, options);
        if (this.debug) {
            graph3d.on('cameraPositionChange', (e) => { this.cameraPosLog.text([e.horizontal, e.vertical, e.distance]) });
        }
    }

    produceColourMap() {
        const colours = [this.maxBins];

        for (let i = 0; i < this.maxBins; i++) {
            const colourWavelength = this.indexToColourWavelength(i);
            colours[i] = ColourUtility.nmToRGB(colourWavelength);
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