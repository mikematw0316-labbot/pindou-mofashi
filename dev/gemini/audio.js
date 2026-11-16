(function () {
  'use strict';

  var AudioCtx = window.AudioContext || window.webkitAudioContext;
  var ctx = null;
  var masterGain = null;
  var compressor = null;

  var musicGain = null;
  var sfxGain = null;

  var enabled = { music: true, sfx: true, voice: true };
  var volume = { music: 0.7, sfx: 0.8, voice: 1.0 };

  var activeNodesCount = 0;
  var MAX_ACTIVE_NODES = 24;

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

        musicGain = ctx.createGain();
        sfxGain = ctx.createGain();

        musicGain.gain.setValueAtTime(volume.music * (enabled.music ? 1 : 0), ctx.currentTime);
        sfxGain.gain.setValueAtTime(volume.sfx * (enabled.sfx ? 1 : 0), ctx.currentTime);

        musicGain.connect(masterGain);
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

  function trackNode(node) {
    if (!node) return;
    activeNodesCount++;
    if (activeNodesCount > MAX_ACTIVE_NODES * 2) {
      activeNodesCount = MAX_ACTIVE_NODES * 2;
    }
    var ended = false;
    function cleanup() {
      if (ended) return;
      ended = true;
      activeNodesCount--;
      if (activeNodesCount < 0) activeNodesCount = 0;
      if (node.disconnect) {
        try { node.disconnect(); } catch (e) {}
      }
    }
    node.onended = cleanup;
  }

  function playTone(freq, type, startTime, duration, gainVal, dest, filterFreq) {
    if (!ctx) return;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    var targetDest = dest || sfxGain;

    if (filterFreq && filterFreq > 0) {
      var filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterFreq, startTime);
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }

    gain.connect(targetDest);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, gainVal), startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
    trackNode(osc);
  }

  function playNoise(startTime, duration, gainVal, dest, cutoff) {
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
    trackNode(noise);
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
    patternLength: 16,
    songData: null,
    currentGain: 0,
    targetGain: 0,
    fadeSteps: 0,
    isPaused: false
  };

  var NOTE_FREQS = {
    'C3': 130.81, 'D3': 146.83, 'E3': 164.81, 'F3': 174.61, 'G3': 196.00, 'A3': 220.00, 'B3': 246.94,
    'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
    'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99, 'A5': 880.00, 'B5': 987.77,
    'C6': 1046.50
  };

  function parseNote(n) {
    if (!n) return 0;
    if (typeof n === 'number') return n;
    return NOTE_FREQS[n] || 261.63;
  }

  var SONGS = {
    'map': {
      bpm: 84,
      melody: ['E4','G4','C5','B4','A4','G4','E4',null,'E4','G4','C5','E5','D5','C5','B4',null],
      harmony:['C3','C3','G3','G3','A3','A3','E3','E3','F3','F3','C3','C3','G3','G3','G3',null],
      bass:   ['C2',null,'G2',null,'A2',null,'E2',null,'F2',null,'C2',null,'G2',null,'G2',null],
      drums:  ['k','h','s','h','k','h','s','h','k','h','s','h','k','h','s','hh']
    },
    'r1': {
      bpm: 112,
      melody: ['G4','B4','D5','E5','D5','B4','G4',null,'A4','C5','E5','G5','E5','C5','A4',null],
      harmony:['G3','G3','D3','D3','E3','E3','B3','B3','C3','C3','G3','G3','D3','D3','D3',null],
      bass:   ['G2',null,'D2',null,'E2',null,'B2',null,'C2',null,'G2',null,'D2',null,'D2',null],
      drums:  ['k','h','s','h','k','h','s','h','k','h','s','h','k','k','s','hh']
    },
    'r2': {
      bpm: 100,
      melody: ['F4','A4','C5','D5','C5','A4','F4',null,'G4','B4','D5','F5','E5','D5','C5',null],
      harmony:['F3','F3','C3','C3','D3','D3','A3','A3','G3','G3','D3','D3','C3','C3','C3',null],
      bass:   ['F2',null,'C2',null,'D2',null,'A2',null,'G2',null,'D2',null,'C2',null,'C2',null],
      drums:  ['k','h','s','h','k','h','s','h','k','h','s','h','k','h','s','hh']
    },
    'r3': {
      bpm: 96,
      melody: ['D4','F4','A4','C5','A4','F4','D4',null,'E4','G4','B4','D5','B4','G4','E4',null],
      harmony:['D3','D3','A3','A3','F3','F3','C3','C3','E3','E3','B3','B3','G3','G3','A3',null],
      bass:   ['D2',null,'A2',null,'F2',null,'C2',null,'E2',null,'B2',null,'G2',null,'A2',null],
      drums:  ['k','s','k','s','k','s','k','s','k','s','k','s','k','s','k','s']
    },
    'r4': {
      bpm: 120,
      melody: ['A4','C5','E5','A5','G5','E5','C5',null,'B4','D5','F5','G5','F5','D5','B4',null],
      harmony:['A3','A3','E3','E3','F3','F3','C3','C3','G3','G3','D3','D3','E3','E3','E3',null],
      bass:   ['A2',null,'E2',null,'F2',null,'C2',null,'G2',null,'D2',null,'E2',null,'E2',null],
      drums:  ['k','h','s','h','k','h','s','h','k','h','s','h','k','k','s','hh']
    },
    'r5': {
      bpm: 88,
      melody: ['E4','G4','B4','E5','D5','B4','G4',null,'F4','A4','C5','E5','D5','C5','B4',null],
      harmony:['E3','E3','B3','B3','C3','C3','G3','G3','D3','D3','A3','A3','B3','B3','B3',null],
      bass:   ['E2',null,'B2',null,'C2',null,'G2',null,'D2',null,'A2',null,'B2',null,'B2',null],
      drums:  ['k','h','s','h','k','h','s','h','k','h','s','h','k','h','s','hh']
    }
  };

  function getSongData(id) {
    var isBoss = id && id.indexOf('boss') === 0;
    var baseId = isBoss ? id.replace('boss', 'r') : id;
    var song = SONGS[baseId] || SONGS['map'];
    if (!song) return SONGS['map'];

    if (isBoss) {
      return {
        bpm: Math.round(song.bpm * 1.2),
        melody: song.melody,
        harmony: song.harmony,
        bass: song.bass.map(function(n) { return n ? n.replace('2', '1') : null; }),
        drums: song.drums.map(function(d) { return d === 's' ? 'S' : (d === 'k' ? 'K' : d); }),
        isBoss: true
      };
    }
    return song;
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
    if (!ctx || !musicGain) return;
    var song = musicState.songData;
    if (!song) return;

    var melNote = song.melody[step];
    if (melNote) {
      var freq = parseNote(melNote);
      playTone(freq, 'triangle', time, 0.15, 0.12 * volume.music, musicGain, 1500);
    }

    var harmNote = song.harmony[step];
    if (harmNote && step % 2 === 0) {
      var hFreq = parseNote(harmNote);
      playTone(hFreq, 'sawtooth', time, 0.3, 0.06 * volume.music, musicGain, 800);
    }

    var bassNote = song.bass[step];
    if (bassNote || (musicState.tension && step % 2 === 0)) {
      var bFreq = parseNote(bassNote || 'C2');
      playTone(bFreq, 'sine', time, 0.2, 0.18 * volume.music, musicGain, 400);
    }

    var drum = song.drums[step];
    if (drum === 'k' || drum === 'K') {
      var kickOsc = ctx.createOscillator();
      var kickGain = ctx.createGain();
      kickOsc.frequency.setValueAtTime(150, time);
      kickOsc.frequency.exponentialRampToValueAtTime(30, time + 0.08);
      kickGain.gain.setValueAtTime(drum === 'K' ? 0.3 : 0.2, time);
      kickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);
      kickOsc.connect(kickGain);
      kickGain.connect(musicGain);
      kickOsc.start(time);
      kickOsc.stop(time + 0.1);
      trackNode(kickOsc);
    } else if (drum === 's' || drum === 'S') {
      playNoise(time, 0.08, drum === 'S' ? 0.2 : 0.12, musicGain, 2000);
    } else if (drum === 'h' || drum === 'hh') {
      playNoise(time, 0.04, 0.06, musicGain, 5000);
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
          playTone(f, 'sine', now, 0.08, 0.2 * volume.sfx, dest, 2000);
          break;

        case 'hit':
          playTone(220, 'triangle', now, 0.12, 0.3 * volume.sfx, dest, 1000);
          playNoise(now, 0.06, 0.2 * volume.sfx, dest, 800);
          break;

        case 'defeat':
          var combo = opts.combo || 1;
          var baseF = 523.25 + Math.min(combo * 20, 300);
          playTone(baseF, 'sine', now, 0.25, 0.25 * volume.sfx, dest, 3000);
          playTone(baseF * 1.25, 'triangle', now + 0.05, 0.2, 0.2 * volume.sfx, dest, 3000);
          break;

        case 'wrong':
          playTone(150, 'sawtooth', now, 0.2, 0.25 * volume.sfx, dest, 400);
          playTone(120, 'sawtooth', now + 0.08, 0.2, 0.25 * volume.sfx, dest, 300);
          break;

        case 'lock':
          playTone(300, 'square', now, 0.15, 0.15 * volume.sfx, dest, 800);
          break;

        case 'hurt':
          playTone(80, 'sawtooth', now, 0.4, 0.4 * volume.sfx, dest, 250);
          playNoise(now, 0.3, 0.3 * volume.sfx, dest, 400);
          break;

        case 'bossCharge':
          playTone(200, 'sawtooth', now, 0.5, 0.2 * volume.sfx, dest, 600);
          break;

        case 'bossAttack':
          playTone(100, 'square', now, 0.4, 0.35 * volume.sfx, dest, 300);
          playNoise(now, 0.35, 0.3 * volume.sfx, dest, 500);
          break;

        case 'peek':
          playTone(600, 'sine', now, 0.1, 0.15 * volume.sfx, dest, 2000);
          break;

        case 'countdown':
          playTone(440, 'sine', now, 0.15, 0.2 * volume.sfx, dest, 1500);
          break;

        case 'go':
          playTone(880, 'sine', now, 0.3, 0.25 * volume.sfx, dest, 3000);
          playTone(523.25, 'triangle', now, 0.3, 0.25 * volume.sfx, dest, 2000);
          break;

        case 'unlock':
          playTone(659.25, 'sine', now, 0.2, 0.2 * volume.sfx, dest, 2500);
          playTone(783.99, 'sine', now + 0.1, 0.3, 0.25 * volume.sfx, dest, 3000);
          break;

        case 'star':
          var index = opts.index || 0;
          var starFreqs = [523.25, 659.25, 783.99];
          var sf = starFreqs[Math.min(index, 2)];
          playTone(sf, 'sine', now, 0.2, 0.2 * volume.sfx, dest, 3000);
          break;

        case 'coin':
          playTone(987.77, 'sine', now, 0.08, 0.2 * volume.sfx, dest, 4000);
          playTone(1318.51, 'sine', now + 0.06, 0.15, 0.2 * volume.sfx, dest, 4000);
          break;

        case 'buy':
          playTone(523.25, 'triangle', now, 0.1, 0.2 * volume.sfx, dest, 2000);
          playTone(659.25, 'triangle', now + 0.08, 0.15, 0.2 * volume.sfx, dest, 2500);
          break;

        case 'combo':
          var tier = opts.tier || 1;
          playTone(400 + tier * 150, 'sine', now, 0.2, 0.25 * volume.sfx, dest, 2500);
          break;

        case 'comboBreak':
          playTone(250, 'sawtooth', now, 0.25, 0.2 * volume.sfx, dest, 500);
          break;

        case 'win':
          var winNotes = [523.25, 659.25, 783.99, 1046.50];
          for (var i = 0; i < winNotes.length; i++) {
            playTone(winNotes[i], 'triangle', now + i * 0.12, 0.25, 0.25 * volume.sfx, dest, 3000);
          }
          break;

        case 'lose':
          var loseNotes = [392.00, 349.23, 329.63, 293.66];
          for (var j = 0; j < loseNotes.length; j++) {
            playTone(loseNotes[j], 'sawtooth', now + j * 0.18, 0.3, 0.25 * volume.sfx, dest, 800);
          }
          break;

        case 'click':
        default:
          playTone(500, 'sine', now, 0.05, 0.15 * volume.sfx, dest, 1500);
          break;
      }
    },

    music: {
      play: function (id) {
        if (!initCtx()) return;
        id = id || 'map';
        if (musicState.playing && musicState.track === id) return;

        musicState.track = id;
        musicState.songData = getSongData(id);
        musicState.tempo = musicState.songData.bpm;
        if (musicState.tension) musicState.tempo = Math.round(musicState.tempo * 1.05);

        musicState.playing = true;
        musicState.isPaused = false;

        if (musicGain) {
          musicGain.gain.setValueAtTime(0, ctx.currentTime);
          var targetVol = volume.music * (enabled.music ? 1 : 0);
          musicGain.gain.linearRampToValueAtTime(targetVol, ctx.currentTime + 0.6);
        }

        startMusicLoop();
      },

      stop: function () {
        if (!musicState.playing || !ctx) return;
        if (musicGain) {
          musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
          musicGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
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
        if (musicState.songData) {
          var baseBpm = musicState.songData.bpm;
          musicState.tempo = musicState.tension ? Math.round(baseBpm * 1.1) : baseBpm;
        }
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

        if (musicGain && musicState.playing && !musicState.isPaused) {
          var normalVol = volume.music * (enabled.music ? 1 : 0);
          var lowVol = normalVol * 0.35;
          musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
          musicGain.gain.linearRampToValueAtTime(lowVol, ctx.currentTime + 0.1);

          u.onend = function () {
            if (musicGain && musicState.playing && !musicState.isPaused) {
              musicGain.gain.setValueAtTime(musicGain.gain.value, ctx.currentTime);
              musicGain.gain.linearRampToValueAtTime(normalVol, ctx.currentTime + 0.2);
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
        if (musicGain && ctx) {
          musicGain.gain.setValueAtTime(enabled.music ? volume.music : 0, ctx.currentTime);
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
        if (musicGain && ctx && enabled.music) {
          musicGain.gain.setValueAtTime(volume.music, ctx.currentTime);
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
      if (musicGain && ctx) {
        musicGain.gain.setValueAtTime(0, ctx.currentTime);
      }
      if (window.speechSynthesis) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
      }
    },

    resume: function () {
      if (!musicState.isPaused) return;
      musicState.isPaused = false;
      if (musicState.playing && ctx) {
        if (musicGain) {
          var targetVol = volume.music * (enabled.music ? 1 : 0);
          musicGain.gain.setValueAtTime(0, ctx.currentTime);
          musicGain.gain.linearRampToValueAtTime(targetVol, ctx.currentTime + 0.3);
        }
        startMusicLoop();
      }
    },

    debug: function () {
      return {
        state: ctx ? ctx.state : 'no-context',
        activeNodes: activeNodesCount,
        track: musicState.track,
        scheduledUntil: musicState.nextNoteTime
      };
    }
  };
})();
