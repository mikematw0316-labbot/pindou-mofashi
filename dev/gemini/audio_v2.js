(function () {
  'use strict';

  var AudioCtx = window.AudioContext || window.webkitAudioContext;
  var ctx = null;
  var masterGain = null;
  var compressor = null;
  var sfxGain = null;

  var enabled = { music: true, sfx: true, voice: true };
  var volume = { music: 0.7, sfx: 0.8, voice: 1.0 };

  var activeNodes = [];
  var MAX_ACTIVE_NODES = 24;

  var warnedNotes = {};

  function initCtx() {
    if (!AudioCtx) return false;
    if (!ctx) {
      try {
        ctx = new AudioCtx();
        compressor = ctx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-18, ctx.currentTime);
        compressor.knee.setValueAtTime(6, ctx.currentTime);
        compressor.ratio.setValueAtTime(4, ctx.currentTime);
        compressor.attack.setValueAtTime(0.003, ctx.currentTime);
        compressor.release.setValueAtTime(0.25, ctx.currentTime);

        masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(1.0, ctx.currentTime);

        sfxGain = ctx.createGain();
        sfxGain.gain.setValueAtTime(volume.sfx * (enabled.sfx ? 1 : 0), ctx.currentTime);

        sfxGain.connect(masterGain);
        masterGain.connect(compressor);
        compressor.connect(ctx.destination);
      } catch (e) {
        ctx = null;
      }
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(function () {});
    }
    return !!ctx;
  }

  function trackNode(nodeObj) {
    if (!nodeObj) return;
    activeNodes.push(nodeObj);
    if (activeNodes.length > MAX_ACTIVE_NODES) {
      var oldest = activeNodes.shift();
      if (oldest && oldest.stopAndDisconnect) {
        oldest.stopAndDisconnect();
      }
    }
  }

  function cleanupNode(nodeObj) {
    var index = activeNodes.indexOf(nodeObj);
    if (index !== -1) {
      activeNodes.splice(index, 1);
    }
    if (nodeObj && nodeObj.nodes) {
      for (var i = 0; i < nodeObj.nodes.length; i++) {
        try {
          nodeObj.nodes[i].stop();
        } catch (e) {}
        try {
          nodeObj.nodes[i].disconnect();
        } catch (e) {}
      }
      nodeObj.nodes = [];
    }
  }

  var NOTE_FREQS = (function () {
    var freqs = {};
    var notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    for (var octave = 1; octave <= 7; octave++) {
      for (var i = 0; i < notes.length; i++) {
        var semitoneFromC4 = (octave - 4) * 12 + (i - 9);
        var f = 440 * Math.pow(2, semitoneFromC4 / 12);
        var name = notes[i] + octave;
        freqs[name] = f;
        if (notes[i].indexOf('#') !== -1) {
          var flatNames = {
            'C#': 'Db',
            'D#': 'Eb',
            'F#': 'Gb',
            'G#': 'Ab',
            'A#': 'Bb'
          };
          freqs[flatNames[notes[i]] + octave] = f;
        }
      }
    }
    return freqs;
  })();

  function parseNote(n) {
    if (!n) return 0;
    if (typeof n === 'number') return n;
    var upper = n.toUpperCase();
    if (NOTE_FREQS[upper] !== undefined) {
      return NOTE_FREQS[upper];
    }
    if (!warnedNotes[upper]) {
      warnedNotes[upper] = true;
      console.warn('PDAudio: Note not found in frequency table, defaulting to C4 (261.63Hz): ' + n);
    }
    return 261.63;
  }

  function playSynthSound(freq, type, startTime, duration, gainVal, dest, filterFreq, adsr) {
    if (!ctx) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    var targetDest = dest || sfxGain;
    var filter = null;

    if (filterFreq && filterFreq > 0) {
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterFreq, startTime);
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }

    gain.connect(targetDest);

    var a = adsr && adsr.attack !== undefined ? adsr.attack : 0.01;
    var d = adsr && adsr.decay !== undefined ? adsr.decay : 0.05;
    var s = adsr && adsr.sustain !== undefined ? adsr.sustain : 0.7;
    var r = adsr && adsr.release !== undefined ? adsr.release : 0.05;

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, gainVal), startTime + a);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainVal * s), startTime + a + d);
    
    var endTime = startTime + duration;
    gain.gain.setValueAtTime(Math.max(0.0001, gainVal * s), endTime - r);
    gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

    osc.start(startTime);
    osc.stop(endTime + 0.05);

    var nodeObj = {
      nodes: [osc, filter, gain].filter(Boolean),
      stopAndDisconnect: function () {
        try { osc.stop(); } catch (e) {}
        try { osc.disconnect(); } catch (e) {}
        if (filter) { try { filter.disconnect(); } catch (e) {} }
        try { gain.disconnect(); } catch (e) {}
        cleanupNode(nodeObj);
      }
    };

    trackNode(nodeObj);
    osc.onended = function () {
      cleanupNode(nodeObj);
    };
  }

  function playNoiseSound(startTime, duration, gainVal, dest, cutoff) {
    if (!ctx) return;
    var bufferSize = ctx.sampleRate * duration;
    var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    var noise = ctx.createBufferSource();
    noise.buffer = buffer;

    var filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(cutoff || 1000, startTime);
    filter.Q.setValueAtTime(1, startTime);

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(gainVal, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest || sfxGain);

    noise.start(startTime);
    noise.stop(startTime + duration + 0.05);

    var nodeObj = {
      nodes: [noise, filter, gain],
      stopAndDisconnect: function () {
        try { noise.stop(); } catch (e) {}
        try { noise.disconnect(); } catch (e) {}
        try { filter.disconnect(); } catch (e) {}
        try { gain.disconnect(); } catch (e) {}
        cleanupNode(nodeObj);
      }
    };

    trackNode(nodeObj);
    noise.onended = function () {
      cleanupNode(nodeObj);
    };
  }

  var voicesList = [];
  var selectedVoice = null;

  function updateVoices() {
    if (!window.speechSynthesis) return;
    try {
      voicesList = window.speechSynthesis.getVoices() || [];
      var zhTW = null;
      var zhOther = null;
      for (var i = 0; i < voicesList.length; i++) {
        var v = voicesList[i];
        var lang = (v.lang || '').toLowerCase();
        if (lang === 'zh-tw' || lang === 'zh_tw') {
          zhTW = v;
          break;
        } else if (lang.indexOf('zh') === 0 && lang.indexOf('hk') === -1 && !zhOther) {
          zhOther = v;
        }
      }
      selectedVoice = zhTW || zhOther || voicesList[0] || null;
    } catch (e) {}
  }

  if (window.speechSynthesis) {
    updateVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }

  var musicState = {
    playing: false,
    track: null,
    tension: false,
    timerId: null,
    nextNoteTime: 0,
    currentStep: 0,
    tempo: 100,
    patternLength: 128,
    songData: null,
    currentGainNode: null,
    isPaused: false
  };

  function generateMelody128(m1, m2, m3, m4) {
    var result = [];
    var phrases = [m1, m2, m3, m4];
    for (var p = 0; p < phrases.length; p++) {
      var phrase = phrases[p];
      for (var n = 0; n < phrase.length; n++) {
        for (var sub = 0; sub < 8; sub++) {
          result.push(sub === 0 ? phrase[n] : null);
        }
      }
    }
    while (result.length < 128) result.push(null);
    return result.slice(0, 128);
  }

  function generateChord128(chords) {
    var result = [];
    var perChord = 128 / chords.length;
    for (var i = 0; i < chords.length; i++) {
      var c = chords[i];
      for (var s = 0; s < perChord; s++) {
        result.push(s === 0 ? c : null);
      }
    }
    while (result.length < 128) result.push(null);
    return result.slice(0, 128);
  }

  function generateDrums128(patternType) {
    var result = [];
    for (var i = 0; i < 128; i++) {
      var beat = i % 16;
      if (patternType === 'march') {
        if (beat === 0 || beat === 8) result.push('k');
        else if (beat === 4 || beat === 12) result.push('s');
        else if (beat % 2 === 0) result.push('h');
        else result.push(null);
      } else if (patternType === 'heavy') {
        if (beat === 0 || beat === 6 || beat === 8 || beat === 14) result.push('K');
        else if (beat === 4 || beat === 12) result.push('S');
        else result.push('h');
      } else {
        if (beat === 0 || beat === 8) result.push('k');
        else if (beat === 4 || beat === 12) result.push('s');
        else if (beat % 4 === 2) result.push('h');
        else result.push(null);
      }
    }
    return result;
  }

  var SONGS = {
    'map': {
      bpm: 84,
      melody: generateMelody128(['E4','G4'], ['C5','B4'], ['A4','G4'], ['E4','C4']),
      harmony: generateChord128(['C3', 'G3', 'A3', 'F3']),
      bass: generateChord128(['C2', 'G2', 'A2', 'F2']),
      drums: generateDrums128('normal')
    },
    'r1': {
      bpm: 112,
      melody: generateMelody128(['G4','B4'], ['D5','E5'], ['D5','B4'], ['G4','G4']),
      harmony: generateChord128(['G3', 'D3', 'E3', 'C3']),
      bass: generateChord128(['G2', 'D2', 'E2', 'C2']),
      drums: generateDrums128('normal')
    },
    'r2': {
      bpm: 100,
      melody: generateMelody128(['F4','A4'], ['C5','D5'], ['C5','A4'], ['F4','F4']),
      harmony: generateChord128(['F3', 'C3', 'D3', 'G3']),
      bass: generateChord128(['F2', 'C2', 'D2', 'G2']),
      drums: generateDrums128('normal')
    },
    'r3': {
      bpm: 96,
      melody: generateMelody128(['D4','F4'], ['A4','C5'], ['A4','F4'], ['D4','D4']),
      harmony: generateChord128(['D3', 'A3', 'F3', 'E3']),
      bass: generateChord128(['D2', 'A2', 'F2', 'E2']),
      drums: generateDrums128('normal')
    },
    'r4': {
      bpm: 120,
      melody: generateMelody128(['A4','C#5'], ['E5','A5'], ['G#5','E5'], ['C#5','A4']),
      harmony: generateChord128(['A3', 'E3', 'F#3', 'D3']),
      bass: generateChord128(['A2', 'E2', 'F#2', 'D2']),
      drums: generateDrums128('march')
    },
    'r5': {
      bpm: 88,
      melody: generateMelody128(['E4','G#4'], ['B4','E5'], ['D5','B4'], ['G#4','E4']),
      harmony: generateChord128(['E3', 'B3', 'C3', 'A3']),
      bass: generateChord128(['E2', 'B2', 'C2', 'A2']),
      drums: generateDrums128('normal')
    },
    'boss1': {
      bpm: 130,
      melody: generateMelody128(['G4','B4','D5'], ['E5','D5','B4'], ['A4','C5','E5'], ['G5','E5','G4']),
      harmony: generateChord128(['G3', 'B3', 'C3', 'D3']),
      bass: generateChord128(['G1', 'B1', 'C2', 'D2']),
      drums: generateDrums128('heavy')
    },
    'boss2': {
      bpm: 125,
      melody: generateMelody128(['F4','A4','C5'], ['D5','C5','A4'], ['G4','B4','D5'], ['F5','D5','F4']),
      harmony: generateChord128(['F3', 'A3', 'G3', 'C3']),
      bass: generateChord128(['F1', 'A1', 'G1', 'C2']),
      drums: generateDrums128('heavy')
    },
    'boss3': {
      bpm: 120,
      melody: generateMelody128(['D4','F4','A4'], ['C5','A4','F4'], ['E4','G4','B4'], ['D5','B4','D4']),
      harmony: generateChord128(['D3', 'F3', 'E3', 'A3']),
      bass: generateChord128(['D1', 'F1', 'E1', 'A1']),
      drums: generateDrums128('heavy')
    },
    'boss4': {
      bpm: 140,
      melody: generateMelody128(['A4','C#5','E5'], ['A5','G#5','E5'], ['B4','D5','F#5'], ['A5','F#5','A4']),
      harmony: generateChord128(['A3', 'C#3', 'B3', 'E3']),
      bass: generateChord128(['A1', 'C#2', 'B1', 'E2']),
      drums: generateDrums128('heavy')
    },
    'boss5': {
      bpm: 115,
      melody: generateMelody128(['E4','G#4','B4'], ['E5','D5','B4'], ['F#4','A4','C#5'], ['E5','C#5','E4']),
      harmony: generateChord128(['E3', 'G#3', 'F#3', 'B3']),
      bass: generateChord128(['E1', 'G#1', 'F#1', 'B1']),
      drums: generateDrums128('heavy')
    }
  };

  function getSongData(id) {
    return SONGS[id] || SONGS['map'];
  }

  function createDelayNode() {
    if (!ctx) return null;
    var delay = ctx.createDelay();
    delay.delayTime.value = 0.25;
    var feedback = ctx.createGain();
    feedback.gain.value = 0.3;
    var wetGain = ctx.createGain();
    wetGain.gain.value = 0.25;

    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wetGain);
    return { delay: delay, wet: wetGain };
  }

  function scheduler() {
    if (!ctx || !musicState.playing || musicState.isPaused) return;

    var secondsPerBeat = 60.0 / musicState.tempo;
    var secondsPerSixteenth = secondsPerBeat / 4;

    while (musicState.nextNoteTime < ctx.currentTime + 0.2) {
      playMusicStep(musicState.currentStep, musicState.nextNoteTime);
      musicState.nextNoteTime += secondsPerSixteenth;
      musicState.currentStep = (musicState.currentStep + 1) % musicState.patternLength;
    }
  }

  function playMusicStep(step, time) {
    if (!ctx || !musicState.currentGainNode) return;
    var song = musicState.songData;
    if (!song) return;

    var dest = musicState.currentGainNode;

    var melNote = song.melody[step];
    if (melNote) {
      var freq = parseNote(melNote);
      playSynthSound(freq, 'triangle', time, 0.15, 0.12 * volume.music, dest, 1500, { attack: 0.01, decay: 0.05, sustain: 0.6, release: 0.05 });
    }

    var harmNote = song.harmony[step];
    if (harmNote && step % 4 === 0) {
      var hFreq = parseNote(harmNote);
      playSynthSound(hFreq, 'sawtooth', time, 0.3, 0.06 * volume.music, dest, 800, { attack: 0.02, decay: 0.1, sustain: 0.5, release: 0.1 });
    }

    var bassNote = song.bass[step];
    if (bassNote) {
      var bFreq = parseNote(bassNote);
      playSynthSound(bFreq, 'sine', time, 0.2, 0.18 * volume.music, dest, 400, { attack: 0.01, decay: 0.08, sustain: 0.4, release: 0.05 });
    }

    if (musicState.tension && step % 2 === 0) {
      playSynthSound(65.41, 'sawtooth', time, 0.1, 0.15 * volume.music, dest, 300, { attack: 0.01, decay: 0.05, sustain: 0.2, release: 0.04 });
      if (step % 8 === 0) {
        var kickOsc = ctx.createOscillator();
        var kickGain = ctx.createGain();
        kickOsc.frequency.setValueAtTime(100, time);
        kickOsc.frequency.exponentialRampToValueAtTime(30, time + 0.1);
        kickGain.gain.setValueAtTime(0.25 * volume.music, time);
        kickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
        kickOsc.connect(kickGain);
        kickGain.connect(dest);
        kickOsc.start(time);
        kickOsc.stop(time + 0.15);
      }
    }

    var drum = song.drums[step];
    if (drum === 'k' || drum === 'K') {
      var kickOsc2 = ctx.createOscillator();
      var kickGain2 = ctx.createGain();
      kickOsc2.frequency.setValueAtTime(150, time);
      kickOsc2.frequency.exponentialRampToValueAtTime(30, time + 0.08);
      kickGain2.gain.setValueAtTime(drum === 'K' ? 0.3 : 0.2, time);
      kickGain2.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);
      kickOsc2.connect(kickGain2);
      kickGain2.connect(dest);
      kickOsc2.start(time);
      kickOsc2.stop(time + 0.1);
    } else if (drum === 's' || drum === 'S') {
      playNoiseSound(time, 0.08, drum === 'S' ? 0.2 : 0.12, dest, 2000);
    } else if (drum === 'h' || drum === 'hh') {
      playNoiseSound(time, 0.04, 0.06, dest, 5000);
    }
  }

  var musicInterval = null;

  function startMusicLoop() {
    if (musicInterval) clearInterval(musicInterval);
    musicState.nextNoteTime = ctx.currentTime + 0.05;
    musicState.currentStep = 0;
    musicInterval = setInterval(scheduler, 25);
  }

  function stopMusicLoop() {
    if (musicInterval) {
      clearInterval(musicInterval);
      musicInterval = null;
    }
  }

  window.PDAudio = {
    unlock: function () {
      if (!initCtx()) return;
      try {
        var buffer = ctx.createBuffer(1, 1, 22050);
        var source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      } catch (e) {}

      if (window.speechSynthesis) {
        try {
          var u = new SpeechSynthesisUtterance('');
          window.speechSynthesis.speak(u);
        } catch (e) {}
      }
    },

    sfx: function (name, opts) {
      if (!initCtx() || !enabled.sfx) return;
      opts = opts || {};
      var now = ctx.currentTime;
      var dest = sfxGain;

      switch (name) {
        case 'key':
          var step = opts.step || 0;
          var f = 400 + Math.min(step * 40, 600);
          playNoiseSound(now, 0.02, 0.1 * volume.sfx, dest, 4000);
          playSynthSound(f, 'sine', now, 0.08, 0.2 * volume.sfx, dest, 2000, { attack: 0.005, decay: 0.03, sustain: 0.5, release: 0.02 });
          break;

        case 'hit':
          playNoiseSound(now, 0.04, 0.25 * volume.sfx, dest, 1200);
          playSynthSound(220, 'triangle', now, 0.12, 0.3 * volume.sfx, dest, 1000, { attack: 0.005, decay: 0.04, sustain: 0.4, release: 0.05 });
          playSynthSound(440, 'sine', now + 0.02, 0.08, 0.1 * volume.sfx, dest, 2000, { attack: 0.005, decay: 0.02, sustain: 0.2, release: 0.03 });
          break;

        case 'defeat':
          var combo = opts.combo || 1;
          var baseF = 523.25 + Math.min(combo * 25, 400);
          playNoiseSound(now, 0.06, 0.2 * volume.sfx, dest, 2500);
          playSynthSound(baseF, 'sine', now, 0.25, 0.25 * volume.sfx, dest, 3500, { attack: 0.01, decay: 0.08, sustain: 0.6, release: 0.1 });
          playSynthSound(baseF * 1.5, 'triangle', now + 0.05, 0.2, 0.2 * volume.sfx, dest, 4000, { attack: 0.01, decay: 0.06, sustain: 0.5, release: 0.08 });
          break;

        case 'wrong':
          playNoiseSound(now, 0.08, 0.15 * volume.sfx, dest, 600);
          playSynthSound(150, 'sawtooth', now, 0.2, 0.25 * volume.sfx, dest, 400, { attack: 0.01, decay: 0.08, sustain: 0.7, release: 0.08 });
          playSynthSound(120, 'sawtooth', now + 0.08, 0.2, 0.25 * volume.sfx, dest, 300, { attack: 0.01, decay: 0.08, sustain: 0.7, release: 0.08 });
          break;

        case 'lock':
          playNoiseSound(now, 0.03, 0.1 * volume.sfx, dest, 1500);
          playSynthSound(300, 'square', now, 0.15, 0.15 * volume.sfx, dest, 800, { attack: 0.005, decay: 0.05, sustain: 0.5, release: 0.05 });
          break;

        case 'hurt':
          playNoiseSound(now, 0.25, 0.35 * volume.sfx, dest, 400);
          playSynthSound(80, 'sawtooth', now, 0.4, 0.4 * volume.sfx, dest, 250, { attack: 0.02, decay: 0.15, sustain: 0.4, release: 0.15 });
          break;

        case 'bossCharge':
          playNoiseSound(now, 0.3, 0.2 * volume.sfx, dest, 800);
          playSynthSound(200, 'sawtooth', now, 0.5, 0.2 * volume.sfx, dest, 600, { attack: 0.05, decay: 0.2, sustain: 0.6, release: 0.1 });
          break;

        case 'bossAttack':
          playNoiseSound(now, 0.35, 0.4 * volume.sfx, dest, 500);
          playSynthSound(100, 'square', now, 0.4, 0.35 * volume.sfx, dest, 300, { attack: 0.01, decay: 0.15, sustain: 0.5, release: 0.15 });
          break;

        case 'peek':
          playSynthSound(600, 'sine', now, 0.1, 0.15 * volume.sfx, dest, 2000, { attack: 0.01, decay: 0.04, sustain: 0.5, release: 0.04 });
          break;

        case 'countdown':
          playSynthSound(440, 'sine', now, 0.15, 0.2 * volume.sfx, dest, 1500, { attack: 0.01, decay: 0.05, sustain: 0.6, release: 0.05 });
          break;

        case 'go':
          playSynthSound(880, 'sine', now, 0.3, 0.25 * volume.sfx, dest, 3000, { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.1 });
          playSynthSound(523.25, 'triangle', now, 0.3, 0.25 * volume.sfx, dest, 2000, { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.1 });
          break;

        case 'unlock':
          playSynthSound(659.25, 'sine', now, 0.2, 0.2 * volume.sfx, dest, 2500, { attack: 0.01, decay: 0.08, sustain: 0.6, release: 0.08 });
          playSynthSound(783.99, 'sine', now + 0.1, 0.3, 0.25 * volume.sfx, dest, 3000, { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.1 });
          break;

        case 'star':
          var index = opts.index || 0;
          var starFreqs = [523.25, 659.25, 783.99];
          var sf = starFreqs[Math.min(index, 2)];
          playSynthSound(sf, 'sine', now, 0.2, 0.2 * volume.sfx, dest, 3000, { attack: 0.01, decay: 0.08, sustain: 0.6, release: 0.08 });
          break;

        case 'coin':
          playSynthSound(987.77, 'sine', now, 0.08, 0.2 * volume.sfx, dest, 4000, { attack: 0.005, decay: 0.03, sustain: 0.5, release: 0.03 });
          playSynthSound(1318.51, 'sine', now + 0.06, 0.15, 0.2 * volume.sfx, dest, 4000, { attack: 0.005, decay: 0.05, sustain: 0.5, release: 0.05 });
          break;

        case 'buy':
          playSynthSound(523.25, 'triangle', now, 0.1, 0.2 * volume.sfx, dest, 2000, { attack: 0.01, decay: 0.04, sustain: 0.5, release: 0.04 });
          playSynthSound(659.25, 'triangle', now + 0.08, 0.15, 0.2 * volume.sfx, dest, 2500, { attack: 0.01, decay: 0.05, sustain: 0.5, release: 0.05 });
          break;

        case 'combo':
          var tier = opts.tier || 1;
          playSynthSound(400 + tier * 150, 'sine', now, 0.2, 0.25 * volume.sfx, dest, 2500, { attack: 0.01, decay: 0.08, sustain: 0.6, release: 0.08 });
          break;

        case 'comboBreak':
          playNoiseSound(now, 0.08, 0.15 * volume.sfx, dest, 800);
          playSynthSound(250, 'sawtooth', now, 0.25, 0.2 * volume.sfx, dest, 500, { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.08 });
          break;

        case 'win':
          var winNotes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
          for (var i = 0; i < winNotes.length; i++) {
            playSynthSound(winNotes[i], 'triangle', now + i * 0.25, 0.4, 0.25 * volume.sfx, dest, 3000, { attack: 0.02, decay: 0.15, sustain: 0.6, release: 0.15 });
          }
          break;

        case 'lose':
          var loseNotes = [392.00, 349.23, 329.63, 293.66, 220.00];
          for (var j = 0; j < loseNotes.length; j++) {
            playSynthSound(loseNotes[j], 'sawtooth', now + j * 0.22, 0.4, 0.25 * volume.sfx, dest, 800, { attack: 0.02, decay: 0.15, sustain: 0.6, release: 0.15 });
          }
          break;

        case 'click':
        default:
          playSynthSound(500, 'sine', now, 0.05, 0.15 * volume.sfx, dest, 1500, { attack: 0.005, decay: 0.02, sustain: 0.4, release: 0.02 });
          break;
      }
    },

    music: {
      play: function (id) {
        if (!initCtx()) return;
        id = id || 'map';
        if (musicState.playing && musicState.track === id) return;

        var oldGain = musicState.currentGainNode;
        if (oldGain && ctx) {
          try {
            oldGain.gain.setValueAtTime(oldGain.gain.value, ctx.currentTime);
            oldGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
            setTimeout(function () {
              try { oldGain.disconnect(); } catch (e) {}
            }, 650);
          } catch (e) {}
        }

        musicState.track = id;
        musicState.songData = getSongData(id);
        musicState.tempo = musicState.songData.bpm;

        var newGain = ctx.createGain();
        newGain.gain.setValueAtTime(0, ctx.currentTime);

        var delayObj = createDelayNode();
        if (delayObj && masterGain) {
          newGain.connect(delayObj.delay);
          delayObj.wet.connect(masterGain);
        }
        newGain.connect(masterGain);

        musicState.currentGainNode = newGain;
        musicState.playing = true;
        musicState.isPaused = false;

        var targetVol = volume.music * (enabled.music ? 1 : 0);
        newGain.gain.linearRampToValueAtTime(targetVol, ctx.currentTime + 0.6);

        startMusicLoop();
      },

      stop: function () {
        if (!musicState.playing || !ctx) return;
        var oldGain = musicState.currentGainNode;
        if (oldGain) {
          try {
            oldGain.gain.setValueAtTime(oldGain.gain.value, ctx.currentTime);
            oldGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
            setTimeout(function () {
              try { oldGain.disconnect(); } catch (e) {}
            }, 650);
          } catch (e) {}
        }
        setTimeout(function () {
          if (!musicState.playing) {
            stopMusicLoop();
            musicState.track = null;
          }
        }, 650);
        musicState.playing = false;
      },

      setTension: function (on) {
        musicState.tension = !!on;
      }
    },

    speak: function (text, opts) {
      if (!window.speechSynthesis || !enabled.voice || !text) return false;
      opts = opts || {};
      try {
        window.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        if (selectedVoice) u.voice = selectedVoice;
        u.rate = opts.rate !== undefined ? opts.rate : 1.0;
        u.volume = volume.voice;

        if (musicState.currentGainNode && musicState.playing && !musicState.isPaused && ctx) {
          var normalVol = volume.music * (enabled.music ? 1 : 0);
          var lowVol = normalVol * 0.35;
          musicState.currentGainNode.gain.setValueAtTime(musicState.currentGainNode.gain.value, ctx.currentTime);
          musicState.currentGainNode.gain.linearRampToValueAtTime(lowVol, ctx.currentTime + 0.1);

          u.onend = function () {
            if (musicState.currentGainNode && musicState.playing && !musicState.isPaused && ctx) {
              musicState.currentGainNode.gain.setValueAtTime(musicState.currentGainNode.gain.value, ctx.currentTime);
              musicState.currentGainNode.gain.linearRampToValueAtTime(normalVol, ctx.currentTime + 0.2);
            }
          };
          u.onerror = u.onend;
        }

        window.speechSynthesis.speak(u);
        return true;
      } catch (e) {
        return false;
      }
    },

    cancelSpeech: function () {
      if (!window.speechSynthesis) return;
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    },

    voiceInfo: function () {
      return {
        available: !!window.speechSynthesis,
        lang: selectedVoice ? selectedVoice.lang : null,
        name: selectedVoice ? selectedVoice.name : null
      };
    },

    setEnabled: function (cfg) {
      cfg = cfg || {};
      if (cfg.music !== undefined) {
        enabled.music = !!cfg.music;
        if (musicState.currentGainNode && ctx) {
          musicState.currentGainNode.gain.setValueAtTime(enabled.music ? volume.music : 0, ctx.currentTime);
        }
      }
      if (cfg.sfx !== undefined) {
        enabled.sfx = !!cfg.sfx;
        if (sfxGain && ctx) {
          sfxGain.gain.setValueAtTime(enabled.sfx ? volume.sfx : 0, ctx.currentTime);
        }
      }
      if (cfg.voice !== undefined) {
        enabled.voice = !!cfg.voice;
        if (!enabled.voice && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
      }
    },

    setVolume: function (v) {
      v = v || {};
      if (v.music !== undefined) {
        volume.music = Math.max(0, Math.min(1, v.music));
        if (musicState.currentGainNode && ctx && enabled.music) {
          musicState.currentGainNode.gain.setValueAtTime(volume.music, ctx.currentTime);
        }
      }
      if (v.sfx !== undefined) {
        volume.sfx = Math.max(0, Math.min(1, v.sfx));
        if (sfxGain && ctx && enabled.sfx) {
          sfxGain.gain.setValueAtTime(volume.sfx, ctx.currentTime);
        }
      }
      if (v.voice !== undefined) {
        volume.voice = Math.max(0, Math.min(1, v.voice));
      }
    },

    pause: function () {
      musicState.isPaused = true;
      stopMusicLoop();
      if (musicState.currentGainNode && ctx) {
        musicState.currentGainNode.gain.setValueAtTime(0, ctx.currentTime);
      }
      if (window.speechSynthesis) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
      }
    },

    resume: function () {
      if (!musicState.isPaused) return;
      musicState.isPaused = false;
      if (musicState.playing && ctx) {
        if (musicState.currentGainNode) {
          var targetVol = volume.music * (enabled.music ? 1 : 0);
          musicState.currentGainNode.gain.setValueAtTime(0, ctx.currentTime);
          musicState.currentGainNode.gain.linearRampToValueAtTime(targetVol, ctx.currentTime + 0.3);
        }
        startMusicLoop();
      }
    },

    debug: function () {
      return {
        state: ctx ? ctx.state : 'no-context',
        activeNodes: activeNodes.length,
        track: musicState.track,
        scheduledUntil: musicState.nextNoteTime
      };
    }
  };
})();
