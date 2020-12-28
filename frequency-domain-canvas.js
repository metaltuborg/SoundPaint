class FrequencyDomainCanvas {
    constructor(canvas, binCount) {
        this.canvas = canvas;
        this.context = canvas.getContext('2d');
        this.binCount = binCount;

        this.width = undefined;
        this.height = undefined;
        this.barWidth = undefined;
    }

    init() {
        this.setUpCanvasForHighPPI();
        return this;
    }

    setUpCanvasForHighPPI() {
        this.canvas.width = this.canvas.clientWidth * window.devicePixelRatio;
        this.canvas.height = this.canvas.clientHeight * window.devicePixelRatio;
        this.context.scale(window.devicePixelRatio, window.devicePixelRatio);

        this.width = this.canvas.clientWidth;
        this.height = this.canvas.clientHeight;
        this.barWidth = this.width / this.binCount;
    }
}