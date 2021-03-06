function webStimulusPresentation() {
    wsp = this;
    wsp.run = function(funcList, durationList, nTimeQueriesPerFrame, delayMs, missedFrameTolerance, nTimesToTrack, biasAgainstMiss) {
        wsp.funcList = funcList;
        wsp.durationList = durationList;
        if (nTimeQueriesPerFrame == undefined) {
            if (wsp.nTimeQueriesPerFrame == undefined) {
                wsp.nTimeQueriesPerFrame = 1;
            }
        } else {
            wsp.nTimeQueriesPerFrame = nTimeQueriesPerFrame;
        }
        if (delayMs == undefined) {
            wsp.delayMs = 6;
        } else {
            wsp.delayMs = delayMs;
        }
        if (missedFrameTolerance == undefined) {
            wsp.missedFrameTolerance = wsp.delayMs + 4;
        } else {
            wsp.missedFrameTolerance = missedFrameTolerance;
        }
        if (nTimesToTrack == undefined) {
            wsp.nTimesToTrack = 30;
        } else {
            wsp.nTimesToTrack = nTimesToTrack;
        }
        if (biasAgainstMiss == undefined) {
            biasAgainstMiss = 0.5; // No bias. Some bias is better in my experience.
        } else {
            wsp.biasAgainstMiss = biasAgainstMiss;
        }
        wsp.funcIdx = 0;
        wsp.frameTimes = new Array();
        wsp.lastTimes = new Array();
        wsp.nextChangeTime = wsp.getCurrentTime(wsp.nTimeQueriesPerFrame); // forces immediate update
        wsp.doubleRAF(wsp.frameLoop);
    }
    wsp.frameLoop = function() {
        var currTime = wsp.getCurrentTime(wsp.nTimeQueriesPerFrame);
        if (wsp.lastTimes.length == wsp.nTimesToTrack) {
            var nextFrameTime = wsp.lastTimes.reduce(function(acc, curr){return acc + curr}, 0)/wsp.nTimesToTrack
                                + (wsp.nTimesToTrack/2 + 1.5)*wsp.msPerFrame;
            wsp.lastTimes.shift();
        } else {
            var nextFrameTime = currTime + wsp.msPerFrame;
        }
        if (Math.abs(nextFrameTime - wsp.nextChangeTime) < Math.abs(nextFrameTime + wsp.msPerFrame - wsp.nextChangeTime)
                && nextFrameTime - currTime > wsp.missedFrameTolerance)) {
            setTimeout(wsp.funcList[wsp.funcIdx], wsp.delayMs - currTime - (nextFrameTime - wsp.msPerFrame)); // Adjust for late rAF callback fires
            wsp.frameTimes.push(nextFrameTime);
            if (wsp.funcIdx == wsp.funcList.length - 1) {
                return;
            }
            wsp.nextChangeTime = nextFrameTime + wsp.durationList[wsp.funcIdx++];
        }
        var nCallbacksMissed = (currTime - (nextFrameTime - wsp.msPerFrame))/wsp.msPerFrame;
        if (nCallbacksMissed - Math.floor(nCallbacksMissed) > wsp.biasAgainstMiss) {
            nCallbacksMissed = Math.ceil(nCallbacksMissed);
        } else {
            nCallbacksMissed = Math.floor(nCallbacksMissed);
        }
        wsp.lastTimes = wsp.lastTimes.map(function(x){return x + nCallbacksMissed*wsp.msPerFrame});
        wsp.lastTimes.push(currTime);
        window.requestAnimationFrame(wsp.frameLoop);
    }
    wsp.getFrameRate = function(nFramesToRecord, nTimeQueriesPerFrame, interFrameTolerance, nNoIncrementAttempts, toleranceIncrement, postFrameRateCalcCallback) {
        wsp.nFramesToRecord = nFramesToRecord;
        wsp.nTimeQueriesPerFrame = nTimeQueriesPerFrame;
        wsp.interFrameTolerance = interFrameTolerance;
        wsp.noIncrementAttempts = noIncrementAttempts;
        wsp.toleranceIncrement = toleranceIncrement;
        wsp.postFrameRateCalcCallback = postFrameRateCalcCallback;
        wsp.frameTimesForRegression = [];
        wsp.doubleRAF(wsp.recordFrame);
    }
    wsp.recordFrame = function() {
        wsp.frameTimesForRegression.push(wsp.getCurrentTime(wsp.nTimeQueriesPerFrame));
        if (wsp.frameTimesForRegression.length == wsp.nFramesToRecord) {
            wsp.computeMsPerFrame();
        } else {
            window.requestAnimationFrame(wsp.recordFrame);
        }
    }
    wsp.computeMsPerFrame = function() {
        // Make sure the inter-frame intervals are consistent
        var i, n = wsp.frameTimesForRegression.length, IFIs = new Array();
        for (i = 0; i < n - 1; i++) {
            IFIs.push(wsp.frameTimesForRegression[i+1] - wsp.frameTimesForRegression[i]);
        }
        var IFImedian = IFIs.sort(function(a, b){return a - b})[Math.ceil((n - 1)/2)];
        // If any inter-frame interval differs from the median by more than wsp.interFrameTolerance, start over
        if (IFImedian - IFIs[0] > wsp.interFrameTolerance || IFIs[n - 2] - IFImedian > wsp.interFrameTolerance) {
            wsp.getFrameRate(wsp.nFramesToRecord,
                             wsp.nTimeQueriesPerFrame,
                             wsp.nNoIncrementAttempts > 0? wsp.interFrameTolerance : wsp.interFrameTolerance + wsp.toleranceIncrement,
                             wsp.nNoIncrementAttempts > 0? wsp.nNoIncrementAttempts - 1 : 0,
                             wsp.toleranceIncrement,
                             wsp.postFrameRateCalcCallback);
        } else { // Simple linear regression
            var y = wsp.frameTimesForRegression;
            var ymean = y.reduce(function(acc, curr){return acc + curr}, 0)/y.length;
            y = y.map(function(element){return element - ymean}); // Subtract mean for numerical stability
            var x = new Array(n);
            for (i = 0; i < n; i++) { // Frame index variable
                x[i] = i;
            }
            var Sy = 0, Sxy = 0;
            for (i = 0; i < n; i++) {
                Sy += y[i];
                Sxy += x[i]*y[i];
            }
            var Sx = n*(n + 1)/2;
            var Sxx = n*(n + 1)*(2*n + 1)/6;
            wsp.msPerFrame = (n*Sxy - Sx*Sy)/(n*Sxx - Sx**2);
            wsp.postFrameRateCalcCallback();
        }
    }
    wsp.getCurrentTime = function(nQueries) {
        var timeEstimate = 0, i; // Take average of multiple time points
        for (i = 0; i < nQueries; i++) {
            timeEstimate += performance.now();
        }
        return timeEstimate/nQueries;
    }
    wsp.doubleRAF = function(callback) {
        window.requestAnimationFrame(
            function() {
                window.requestAnimationFrame(callback);
            }
        );
    }
}