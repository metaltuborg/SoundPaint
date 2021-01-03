//
// This is a port of the python code found at: 
// https://nbviewer.jupyter.org/github/demotu/BMC/blob/master/notebooks/DetectPeaks.ipynb
// 
// original authors of the algorithm: "Marcos Duarte, http://github.com/demotu/BMC"
// author of this javascript port: dirk lüsebrink, http://github.com/crux
// 
class DuarteWatanabe {
    static log = Logger.get("detect-peaks").level(Logger.WARN);

    static Defaults = {
        // detect peaks that are greater than minimum peak height.
        // {None, number}, optional (default = None) 
        mph: undefined,

        // detect peaks that are at least separated by minimum peak distance (in
        // number of data).
        // positive integer, optional (default = 1)
        mpd: 1,

        // detect peaks (valleys) that are greater (smaller) than `threshold` in
        // relation to their immediate neighbors.
        // positive number, optional (default = 0)
        threshold: 0,

        // for a flat peak, keep only the rising edge ('rising'), only the falling
        // edge ('falling'), both edges ('both'), or don't detect a flat peak (None).
        // {None, 'rising', 'falling', 'both'}, optional (default = 'rising')
        //
        // Note: in Javascript for 'None' us 'null'
        edge: 'rising',

        // keep peaks with same height even if they are closer than `mpd`.
        // bool, optional (default = False)
        kpsh: false,

        // if True (1), detect valleys (local minima) instead of peaks.
        // bool, optional (default = False)
        valley: false,
    }

    static signals(x, params) {
        const p = Object.assign({}, this.Defaults, params)
        this.log.debug(`${JSON.stringify(p)}`)

        if (!Array.isArray(x)) {
            throw 'values parameter must be an array of numbers'
        }
        if (x.length < 3) {
            return []
        }

        if (p.valley) {
            x = x.map(v => -v)
            if (p.mph) {
                p.mph = -p.mph
            }
        }
        //this.log.debug(`1:${x}`)

        // find indexes of all peaks
        var dx = x.slice(1).map((v, i) => v - x[i])
        this.log.debug(`2:${dx}`)

        // handle NaN's
        var indnan = dwHelpers.where(x, val => isNaN(val))
        this.log.debug(`3:${indnan}`)
        if (0 < indnan.length) { // if indnan.size:
            this.log.debug(`3.1:${indnan}`)
            indnan.forEach(i => x[i] = Infinity) // x[indnan] = np.inf
            this.log.debug(`3.2:${x}`)
                //     dx[np.where(np.isnan(dx))[0]] = np.inf
            dwHelpers.where(
                    dx, val => isNaN(val)). // np.where(np.isnan(dx))[0]
            forEach(i => dx[i] = Infinity) // dx[np.where(np.isnan(dx))[0]] = np.inf
        }
        this.log.debug(`4:${x}`)
        this.log.debug(`5:${dx}`)

        var [ine, ire, ife] = [
            [],
            [],
            []
        ]
        if (!p.edge) {
            // ine = np.where((np.hstack((dx, 0)) < 0) & (np.hstack((0, dx)) > 0))[0]
            ine = dwHelpers.where(dwHelpers.AA(dwHelpers.A(dx.concat(0), v => v < 0), dwHelpers.A(d[0].concat(dx), v => 0 < v), (a, b) => a && b))
        } else {
            if (p.edge.match(/rising|both/i)) {
                // ire = np.where((np.hstack((dx, 0)) <= 0) & (np.hstack((0, dx)) > 0))[0]
                ire = dwHelpers.where(dwHelpers.AA(dwHelpers.A(dx.concat(0), v => v <= 0), dwHelpers.A([0].concat(dx), v => 0 < v), (a, b) => a && b))
            }
            if (p.edge.match(/falling|both/i)) {
                // ife = np.where((np.hstack((dx, 0)) < 0) & (np.hstack((0, dx)) >= 0))[0]
                ife = dwHelpers.where(dwHelpers.AA(dwHelpers.A(dx.concat(0), v => v < 0), dwHelpers.A([0].concat(dx), v => 0 <= v), (a, b) => a && b))
            }
        }
        //this.log.debug(`6:${ine}`)
        //this.log.debug(`7:${ire}`)
        //this.log.debug(`8:${ife}`)
        var ind = dwHelpers.uniq(dwHelpers.hstack(ine, ire, ife))
        this.log.debug(`9:${ind}`)

        // handle NaN's
        if (0 < ind.length && 0 < indnan.length) {
            // NaN's and values close to NaN's cannot be peaks
            // ind = ind[np.in1d(ind, np.unique(np.hstack((indnan, indnan-1, indnan+1))), invert=True)]
            ind = dwHelpers.mask( // ind = ind[...]
                    ind,
                    dwHelpers.in1d_invert( // np.in1d(..., invert=True)
                        ind, // ind
                        dwHelpers.uniq( // np.unique(n...., invert=True)
                            dwHelpers.hstack( // np.hstack(indnan, indnan-1, indnan+1)
                                indnan, // indnan 
                                dwHelpers.A(indnan, x => x - 1), // indnan-1
                                dwHelpers.A(indnan, x => x + 1))))) // indnan+1
            this.log.debug(`9.1:${ind}`)
        }
        this.log.debug(`10:${ind}`)

        // first and last values of x cannot be peaks
        //  if ind.size and ind[0] == 0:
        //      ind = ind[1:]
        if (ind[0] === 0) {
            ind = ind.slice(1)
        }
        // if ind.size and ind[-1] == x.size-1:
        //    ind = ind[:-1]
        if (ind[ind.length - 1] === x.length - 1) {
            ind = ind.slice(0, -1)
        }
        //this.log.debug(`11:${ind}`)

        // remove peaks < minimum peak height
        // if ind.size and mph is not None:
        //   ind = ind[x[ind] >= mph]
        if (p.mph) {
            ind = dwHelpers.Asub( // ind[x[ind] >= mph]
                ind,
                dwHelpers.where( // x[ind] >= mph
                    dwHelpers.Asub(x, ind), // x[ind]
                    v => v >= p.mph))
        }
        //this.log.debug(`12:${ind}`)
        // remove peaks - neighbors < threshold
        // if ind.size and threshold > 0:
        //     dx = np.min(np.vstack([x[ind]-x[ind-1], x[ind]-x[ind+1]]), axis=0)
        //     ind = np.delete(ind, np.where(dx < threshold)[0])
        if (0 < p.threshold) {
            dx = dwHelpers.min_axis_0(
                    [ // vstack[ [..], [..] ]
                        dwHelpers.AA( // x[ind]-x[ind-1]
                            dwHelpers.Asub(x, ind), // x[ind]
                            dwHelpers.Asub( // x[ind-1]
                                x,
                                dwHelpers.A(ind, i => i - 1)), // ind-1
                            (a, b) => a - b),
                        dwHelpers.AA( // x[ind]-x[ind-1]
                            dwHelpers.Asub(x, ind), // x[ind]
                            dwHelpers.Asub( // x[ind+1]
                                x,
                                dwHelpers.A(ind, i => i + 1)), // ind+1
                            (a, b) => a - b)
                    ])
                //this.log.debug(`12.1:${dx}`)

            // ind = np.delete(ind, np.where(dx < threshold)[0])
            var a = dwHelpers.where(dx, x => (x < p.threshold)) // np.where(dx < threshold)[0])
            ind = ind.filter((_, i) => !a.includes(i)) // ind = np.delete(...
        }
        //this.log.debug(`13:${dx}`)
        //this.log.debug(`14:${ind}`)

        // detect small peaks closer than minimum peak distance
        // if ind.size and mpd > 1:
        if (p.mpd > 1) {
            // ind = ind[np.argsort(x[ind])][::-1]  # sort ind by peak height
            ind = dwHelpers.Asub( // ind[np.argsort(x[ind])][::-1]
                    ind, // ind
                    dwHelpers.argsort( // np.argsort(x[ind])
                        dwHelpers.Asub(x, ind)). // x[ind]
                    reverse()) // np.argsort(x[ind])][::-1]
                //this.log.debug(`15:${ind}`)

            // idel = np.zeros(ind.size, dtype=bool)
            var idel = new Array(ind.length).fill(false)
            for (var i = 0; i < ind.length; i++) { // for i in range(ind.size):
                //this.log.debug(`16:${i}`)
                //this.log.debug(`${i}.17:${idel}`)
                if (!idel[i]) { //      if not idel[i]:
                    var ind_i = ind[i] // ind[i]
                        //this.log.debug(`${i}.17.0:${ind_i}`)
                    let a = dwHelpers.A(ind, v => v >= ind_i - p.mpd) // (ind >= ind[i] - mpd)
                        //this.log.debug(`${i}.17.1:${a}`)
                    let b = dwHelpers.A(ind, v => v <= ind_i + p.mpd) // (ind <= ind[i] + mpd)
                        //this.log.debug(`${i}.17.2:${b}`)

                    // (x[ind[i]] > x[ind] if kpsh else True)
                    var x_ind_i = x[ind_i] // x[ind[i]]
                    let c = (p.kpsh ? // (if kpsh 
                            dwHelpers.A( // x[ind[i]] > x[ind]
                                dwHelpers.Asub(x, ind), // x[ind]
                                v => x_ind_i > v) :
                            new Array(ind.length).fill(true)) //  else True 
                        //this.log.debug(`${i}.17.3:${c}`)

                    // keep peaks with the same height if kpsh is True
                    // idel = idel | (ind >= ind[i] - mpd)                 \
                    //         & (ind <= ind[i] + mpd)                     \
                    //         & (x[ind[i]] > x[ind] if kpsh else True)
                    idel = dwHelpers.AA(
                            idel,
                            dwHelpers.AA(
                                dwHelpers.AA(a, b, (a, b) => (a && b)), // (ind >= ind[i] - mpd) & (ind <= ind[i] + mpd)
                                c, (a, b) => (a && b)), // ... & (x[ind[i]] > x[ind] if kpsh else True)
                            (a, b) => (a || b)) // idel | ...

                    //this.log.debug(`${i}.18:${idel}`)

                    // idel[i] = 0  # Keep current peak
                    idel[i] = false
                        //this.log.debug(`${i}.19:${idel}`)
                }
                //this.log.debug(`${i}.20:${idel}`)
                //this.log.debug(`${i}.21:${ind}`)
            }

            // remove the small peaks and sort back the indexes by their occurrence
            // ind = np.sort(ind[~idel])
            //this.log.debug(`22:${idel}`)
            //this.log.debug(`23:${ind}`)
            ind = dwHelpers.mask( // ind[~idel]
                    ind,
                    dwHelpers.A(idel, v => !v)). // ~idel
            sort((a, b) => a - b) // np.sort(ind[~idel])
                //this.log.debug(`24:${ind}`)
        }
        //this.log.debug(`25:${ind}`)

        return ind
    }
}