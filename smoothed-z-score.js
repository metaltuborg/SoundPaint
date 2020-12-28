// Source: https://github.com/crux/smoothed-z-score
// javascript port of: https://stackoverflow.com/questions/22583391/peak-signal-detection-in-realtime-timeseries-data/48895639#48895639

class ZScore {
    constructor(settings) {
        this.lag = typeof settings.lag === "undefined" ? 5 : settings.lag;
        this.threshold = typeof settings.threshold === "undefined" ? 3.5 : settings.threshold;
        this.influence = typeof settings.influence === "undefined" ? 0.5 : settings.influence;
    }

    sum(a) {
        return a.reduce((acc, val) => acc + val);
    }

    mean(a) {
        return this.sum(a) / a.length;
    }

    stddev(arr) {
        const arr_mean = this.mean(arr);
        const r = function(acc, val) {
            return acc + ((val - arr_mean) * (val - arr_mean));
        }
        return Math.sqrt(arr.reduce(r, 0.0) / arr.length);
    }

    signals(dataset) {
        if (dataset === undefined || dataset.length < this.lag + 2) {
            throw ` ## dataset too short(${dataset.length}) for given lag of ${this.lag}`;
        }

        // init variables
        var signals = Array(dataset.length).fill(0);
        var filteredY = dataset.slice(0);
        const lead_in = dataset.slice(0, this.lag);
        //console.log("1: " + lead_in.toString())
        var avgFilter = [];
        avgFilter[this.lag - 1] = this.mean(lead_in);
        var stdFilter = [];
        stdFilter[this.lag - 1] = this.stddev(lead_in);
        //console.log("2: " + stdFilter.toString())

        for (var i = this.lag; i < dataset.length; i++) {
            //console.log(`${y[i]}, ${avgFilter[i-1]}, ${this.threshold}, ${stdFilter[i-1]}`)
            if (Math.abs(dataset[i] - avgFilter[i - 1]) > (this.threshold * stdFilter[i - 1])) {
                if (dataset[i] > avgFilter[i - 1]) {
                    signals[i] = +1; // positive signal
                } else {
                    signals[i] = -1; // negative signal
                }
                // make influence lower
                filteredY[i] = this.influence * dataset[i] + (1 - this.influence) * filteredY[i - 1];
            } else {
                signals[i] = 0; // no signal
                filteredY[i] = dataset[i];
            }

            // adjust the filters
            const y_lag = filteredY.slice(i - this.lag, i);
            avgFilter[i] = this.mean(y_lag);
            stdFilter[i] = this.stddev(y_lag);
        }

        return signals;
    }
}