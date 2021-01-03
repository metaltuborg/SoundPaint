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
const SpectrumFont = "15px Georgia"

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
        this.debugLog = $("#debugContainer");
        this.binCountLog = $("#binCount");
        this.sampleRateLog = $("#sampleRate");
        this.maxFrequencyLog = $("#maxFrequency");
        this.maxBinsLog = $("#maxBins");
        this.timestampLog = $("#timestamp");
        this.deltaLog = $("#delta");
        this.cameraPosLog = $("#cameraPos");
        this.freqDataLog = $("#freqData");

        this.histogram = new FrequencyDomainCanvas($("#histogram")[0], this.maxBins).init();
        this.zScore = new FrequencyDomainCanvas($("#zScore")[0], this.maxBins, 'ZScore').init();
        this.spectrum = new FrequencyDomainCanvas($("#spectrum")[0], this.maxBins).init();
        this.colourMapContainer = $("#colourMap");

        // Set up other properties.
        this.scorer = new ZScore({
            lag: 20,
            threshold: 3,
            influence: 0.5,
        });

        // Declare other properties in advance.
        this.binColours = undefined;
        this.binComplements = undefined;
        this.lastStep = undefined;
    }

    init() {
        const colourMap = this.produceColourMap();
        this.binColours = colourMap.colours.map((colour) => colour.toRgbString());
        this.binComplements = colourMap.complements.map((colour) => colour.toRgbString());

        if (this.debug) {
            this.debugLog.removeAttr("hidden");
            this.binCountLog.text(this.binCount);
            this.sampleRateLog.text(this.context.sampleRate);
            this.maxFrequencyLog.text(this.maxFrequency);
            this.maxBinsLog.text(this.maxBins);
            this.renderColourMap(colourMap);
        }

        this.renderSpectrum();
        this.renderLoop();
    }

    renderLoop(timestamp) {
        this.analyser.getByteFrequencyData(this.freqDomain);
        let frequencyData = this.freqDomain.slice(0, this.maxBins);

        this.renderHistogram(frequencyData);

        this.renderZScore(this.scorer.signals(frequencyData));

        if (this.debug) {
            if (timestamp != undefined && this.lastStep != undefined) {
                this.timestampLog.text(timestamp);
                this.deltaLog.text(timestamp - this.lastStep);
            }
            this.lastStep = timestamp;
            this.freqDataLog.text(frequencyData.join(" "));
        }

        window.requestAnimationFrame(this.renderLoop.bind(this));
    }

    renderHistogram(data) {
        const barHeightFactor = this.histogram.height / 255;

        this.histogram.blank(ColourUtility.Nero);

        for (let i = 0, x = 0, barHeight; i < this.maxBins; i++, x += this.histogram.barWidth) {
            barHeight = barHeightFactor * data[i];
            this.histogram.flexbar(x, this.histogram.height - barHeight, this.histogram.barWidth, barHeight, this.binColours[i]);
        }
    }

    renderZScore(data) {
        this.zScore.blank(ColourUtility.Nero);

        for (let i = 0, x = 0; i < this.maxBins; i++, x += this.zScore.barWidth) {
            if (data[i] > 0) {
                this.zScore.fullbar(x, this.binColours[i]);
            }
        }
    }

    renderSpectrum() {
        const gap = Math.floor(this.maxBins * 75 / this.spectrum.width);
        //        = 5*15px => 1 label each 5x label heights

        this.spectrum.blank(ColourUtility.Nero);
        this.spectrum.context.font = SpectrumFont;

        for (let i = 0, x = 0; i < this.maxBins; i++, x += this.spectrum.barWidth) {
            this.spectrum.splitbar(x, this.binColours[i], this.binComplements[i], 0.95);
        }
        for (let i = 0; i < this.maxBins; i += gap) {
            this.spectrum.context.save();
            this.spectrum.context.translate(i * this.spectrum.barWidth + 10, this.spectrum.height - 5);
            this.spectrum.context.rotate(MinusHalfPi);
            this.spectrum.context.fillStyle = ColourUtility.White; // this.binComplements[i];
            this.spectrum.context.fillText(Math.floor(i * this.binWidth).toString(), 0, 0);
            this.spectrum.context.restore();
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
            this.cameraPosLog.text([
                options.cameraPosition.horizontal,
                options.cameraPosition.vertical,
                options.cameraPosition.distance
            ]);
            graph3d.on('cameraPositionChange', (e) => {
                this.cameraPosLog.text([
                    e.horizontal,
                    e.vertical,
                    e.distance
                ]);
            });
        }
    }

    produceColourMap() {
        const colours = [this.maxBins];
        const complements = [this.maxBins];

        for (let i = 0; i < this.maxBins; i++) {
            const colourWavelength = this.indexToColourWavelength(i);
            const rgb = ColourUtility.nmToRGB(colourWavelength);
            colours[i] = tinycolor({ r: rgb[0], g: rgb[1], b: rgb[2] });
            complements[i] = colours[i].complement();
        }

        return { colours: colours, complements: complements };
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