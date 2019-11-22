    // --- voice pitch shifter ---
    let voiceChangeStream = null;
    let audioContext = null;
    let audioSrcNode = null;
    let mediaDestNode = null;
    let pitchShifterProcessor = null;
    let normalGainNode = null;
    let shiftGainNode = null;
    let pitchRatio = 0.7;
    let overlapRatio = 0.5;
    const grainSize = 512;

    function setPitch(v) {
      pitchRatio = v;
      normalGainNode.gain.value = 0;
      shiftGainNode.gain.value = 1.0;
    }

    function setNormalPitch() {
      pitchRatio = 1.0;
      normalGainNode.gain.value = 1.0;
      shiftGainNode.gain.value = 0;
    }

    function setMute() {
      normalGainNode.gain.value = 0;
      shiftGainNode.gain.value = 0;
    }

    function clearAudioNode() {
      _stopMeidaStream(voiceChangeStream, 'voiceChangeStream');
      voiceChangeStream = null;

      if (mediaDestNode) {
        mediaDestNode.disconnect();
        mediaDestNode = null;
      }

      if (normalGainNode) {
        normalGainNode.disconnect();
        normalGainNode = null;
      }
      if (shiftGainNode) {
        shiftGainNode.disconnect();
        shiftGainNode = null;
      }

      if (pitchShifterProcessor) {
        pitchShifterProcessor.disconnect();
        pitchShifterProcessor = null;
      }

      if (audioSrcNode) {
        audioSrcNode.disconnect();
        audioSrcNode = null;
      }
    }

    function initSoundProcesser(stream) {
      if (!audioContext) {
        audioContext = new window.AudioContext();
      }
      clearAudioNode();

      audioSrcNode = audioContext.createMediaStreamSource(stream);
      mediaDestNode = audioContext.createMediaStreamDestination();
      voiceChangeStream = mediaDestNode.stream;

      normalGainNode = audioContext.createGain();
      normalGainNode.gain.value = 0;
      audioSrcNode.connect(normalGainNode);
      //normalGainNode.connect(audioContext.destination);
      normalGainNode.connect(mediaDestNode);

      // ---- pitch shifter ---
      pitchShifterProcessor = audioContext.createScriptProcessor(grainSize, 1, 1);
      pitchShifterProcessor.buffer = new Float32Array(grainSize * 2);
      pitchShifterProcessor.grainWindow = hannWindow(grainSize);
      pitchShifterProcessor.onaudioprocess = function (event) {
        const inputData = event.inputBuffer.getChannelData(0);
        const outputData = event.outputBuffer.getChannelData(0);

        for (let i = 0; i < inputData.length; i++) {
          // Apply the window to the input buffer
          inputData[i] *= this.grainWindow[i];

          // Shift half of the buffer
          this.buffer[i] = this.buffer[i + grainSize];

          // Empty the buffer tail
          this.buffer[i + grainSize] = 0.0;
        }

        // Calculate the pitch shifted grain re-sampling and looping the input
        const grainData = new Float32Array(grainSize * 2);
        for (let i = 0, j = 0.0; i < grainSize; i++ , j += pitchRatio) {
          const index = Math.floor(j) % grainSize;
          const a = inputData[index];
          const b = inputData[(index + 1) % grainSize];
          grainData[i] += linearInterpolation(a, b, j % 1.0) * this.grainWindow[i];
        }

        // Copy the grain multiple times overlapping it
        for (let i = 0; i < grainSize; i += Math.round(grainSize * (1.0 - overlapRatio))) {
          for (let j = 0; j <= grainSize; j++) {
            this.buffer[i + j] += grainData[j];
          }
        }

        // Output the first half of the buffer
        for (let i = 0; i < grainSize; i++) {
          outputData[i] = this.buffer[i];
        }
      };
      audioSrcNode.connect(pitchShifterProcessor);

      shiftGainNode = audioContext.createGain();
      shiftGainNode.gain.value = 1.0;
      pitchShifterProcessor.connect(shiftGainNode);
      //shiftGainNode.connect(audioContext.destination);
      shiftGainNode.connect(mediaDestNode);

      //modifiedStream.addTrack(voiceChangeStream.getAudioTracks()[0]);
      return voiceChangeStream;

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

    function _stopMeidaStream(stream, label) {
      if (stream) {
        stream.getTracks().forEach(track => {
          console.log('stop ' + label + ' track:', track);
          track.stop();
        });
      }
    }
    // --- voice pitch shifter ---
