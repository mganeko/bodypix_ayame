'use static'

// --- voice pitch shifter ---

class PitchShifter {
  // NO static property// --- static property ---
  //static audioContext = null;
  //static grainSize = 512;

  // --- static function ---
  static _stopMeidaStream(stream, label) {
    if (stream) {
      stream.getTracks().forEach(track => {
        console.log('stop ' + label + ' track:', track);
        track.stop();
      });
    }
  }


  // --- constructor ----
  constructor(pitch) {
    // --- instance property ---
    this.pitchRatio = pitch;

    this.voiceChangeStream = null;
    this.audioSrcNode = null;
    this.mediaDestNode = null;
    this.pitchShifterProcessor = null;
    this.normalGainNode = null;
    this.shiftGainNode = null;
    this.overlapRatio = 0.5;
    this.grainSize = 512;
  }

  // --- instance function ---
  setPitch(v) {
    this.pitchRatio = v;
    this.pitchShifterProcessor.pitchRatio = this.pitchRatio;
    this.normalGainNode.gain.value = 0;
    this.shiftGainNode.gain.value = 1.0;
  }

  setNormalPitch() {
    this.pitchRatio = 1.0;
    this.pitchShifterProcessor.pitchRatio = this.pitchRatio;
    this.normalGainNode.gain.value = 1.0;
    this.shiftGainNode.gain.value = 0;
  }

  setMute() {
    this.normalGainNode.gain.value = 0;
    this.shiftGainNode.gain.value = 0;
  }

  clearAudioNode() {
    PitchShifter._stopMeidaStream(this.voiceChangeStream, 'voiceChangeStream');
    this.voiceChangeStream = null;

    if (this.mediaDestNode) {
      this.mediaDestNode.disconnect();
      this.mediaDestNode = null;
    }

    if (this.normalGainNode) {
      this.normalGainNode.disconnect();
      this.normalGainNode = null;
    }
    if (this.shiftGainNode) {
      this.shiftGainNode.disconnect();
      this.shiftGainNode = null;
    }

    if (this.pitchShifterProcessor) {
      this.pitchShifterProcessor.disconnect();
      this.pitchShifterProcessor = null;
    }

    if (this.audioSrcNode) {
      this.audioSrcNode.disconnect();
      this.audioSrcNode = null;
    }
  }

  initSoundProcesser(audioContext, stream) {
    this.clearAudioNode();

    this.audioSrcNode = audioContext.createMediaStreamSource(stream);
    this.mediaDestNode = audioContext.createMediaStreamDestination();
    this.voiceChangeStream = this.mediaDestNode.stream;

    this.normalGainNode = audioContext.createGain();
    this.normalGainNode.gain.value = 0;
    this.audioSrcNode.connect(this.normalGainNode);
    // this.normalGainNode.connect(audioContext.destination);
    this.normalGainNode.connect(this.mediaDestNode);

    // ---- pitch shifter ---
    this.pitchShifterProcessor = audioContext.createScriptProcessor(this.grainSize, 1, 1);
    this.pitchShifterProcessor.buffer = new Float32Array(this.grainSize * 2);
    this.pitchShifterProcessor.grainWindow = hannWindow(this.grainSize);
    this.pitchShifterProcessor.grainSize = this.grainSize;
    this.pitchShifterProcessor.pitchRatio = this.pitchRatio;
    this.pitchShifterProcessor.overlapRatio = this.overlapRatio;
    this.pitchShifterProcessor.onaudioprocess = function (event) {
      // this === pitchShiftProcessor

      const inputData = event.inputBuffer.getChannelData(0);
      const outputData = event.outputBuffer.getChannelData(0);

      for (let i = 0; i < inputData.length; i++) {
        // Apply the window to the input buffer
        inputData[i] *= this.grainWindow[i];

        // Shift half of the buffer
        this.buffer[i] = this.buffer[i + this.grainSize];

        // Empty the buffer tail
        this.buffer[i + this.grainSize] = 0.0;
      }

      // Calculate the pitch shifted grain re-sampling and looping the input
      const grainData = new Float32Array(this.grainSize * 2);
      for (let i = 0, j = 0.0; i < this.grainSize; i++ , j += this.pitchRatio) {
        const index = Math.floor(j) % this.grainSize;
        const a = inputData[index];
        const b = inputData[(index + 1) % this.grainSize];
        grainData[i] += linearInterpolation(a, b, j % 1.0) * this.grainWindow[i];
      }

      // Copy the grain multiple times overlapping it
      for (let i = 0; i < this.grainSize; i += Math.round(this.grainSize * (1.0 - this.overlapRatio))) {
        for (let j = 0; j <= this.grainSize; j++) {
          this.buffer[i + j] += grainData[j];
        }
      }

      // Output the first half of the buffer
      for (let i = 0; i < this.grainSize; i++) {
        outputData[i] = this.buffer[i];
      }
    };
    this.audioSrcNode.connect(this.pitchShifterProcessor);

    this.shiftGainNode = audioContext.createGain();
    this.shiftGainNode.gain.value = 1.0;
    this.pitchShifterProcessor.connect(this.shiftGainNode);
    //this.shiftGainNode.connect(audioContext.destination); // test
    this.shiftGainNode.connect(this.mediaDestNode);

    return this.voiceChangeStream;

    //---------------- inner function ----------------
    function hannWindow(length) {
      const hwindow = new Float32Array(length);
      for (var i = 0; i < length; i++) {
        hwindow[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (length - 1)));
      }
      return hwindow;
    };

    function linearInterpolation(a, b, t) {
      return a + (b - a) * t;
    };
  }
}
// --- voice pitch shifter ---
