class FrequencyDomainCanvas {
    static LabelFont = "20px Georgia";

    constructor(canvas, binCount, label) {
        this.canvas = canvas;
        this.context = canvas.getContext('2d');
        this.binCount = binCount;

        this.renderLabel = false;
        if (label != undefined) {
            this.label = label;
            this.renderLabel = true;
        }

        this.width = undefined;
        this.height = undefined;
        this.barWidth = undefined;
    }

    init() {
        this.setUpCanvasForHighPPI();
        this.blank(ColourUtility.Nero);
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

    blank(colour) {
        this.context.fillStyle = colour;
        this.context.fillRect(0, 0, this.width, this.height);
        if (this.renderLabel) {
            this.context.font = FrequencyDomainCanvas.LabelFont;
            this.context.fillStyle = ColourUtility.White;
            this.context.fillText(this.label, 10, 30);
        }
    }

    fullbar(x, colour) {
        this.context.fillStyle = colour;
        this.context.fillRect(x, 0, this.barWidth, this.height);
    }

    splitbar(x, topColour, bottomColour, splitRatio = 0.5) {
        this.context.fillStyle = topColour;
        this.context.fillRect(x, 0, this.barWidth, this.height * splitRatio);
        this.context.fillStyle = bottomColour;
        this.context.fillRect(x, this.height * splitRatio, this.barWidth, this.height);
    }

    flexbar(x, y, w, h, colour) {
        this.context.fillStyle = colour;
        this.context.fillRect(x, y, w, h);
    }

    hide() {
        $(this.canvas).css("display", "none");
    }

    unhide() {
        $(this.canvas).css("display", "");
    }
}