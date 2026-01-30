import { GAME_STATES, EVENTS, GAME } from '../utils/Constants.js';
import { globalEvents } from '../utils/EventEmitter.js';

/**
 * GameStateManager
 * Manages overall game state and transitions
 */

export class GameStateManager {
  constructor() {
    this.currentState = GAME_STATES.MENU;
    this.previousState = null;
    this.stateBeforePause = null;

    // Match state
    this.playerScore = 0;
    this.botScore = 0;
    this.currentRound = 0;
    this.roundsToWin = GAME.ROUNDS_TO_WIN;

    // Timing
    this.stateTimer = 0;
    this.countdownValue = 0;
    this.savedStateTimer = 0;
    this.pendingRoundTimer = null;
    this.pendingMatchEndTimer = null;

    // Statistics
    this.stats = {
      playerKills: 0,
      playerDeaths: 0,
      botKills: 0,
      botDeaths: 0,
      totalDeflections: 0,
      matchStartTime: 0,
    };
  }

  /**
   * Get current state
   */
  getState() {
    return this.currentState;
  }

  /**
   * Check if in specific state
   */
  isState(state) {
    return this.currentState === state;
  }

  /**
   * Transition to new state
   */
  setState(newState) {
    if (this.currentState === newState) return;

    this.previousState = this.currentState;
    this.currentState = newState;
    this.stateTimer = 0;

    globalEvents.emit(`state:${newState}`, {
      previousState: this.previousState,
      newState,
    });
  }

  /**
   * Start a new match
   */
  startMatch() {
    this.playerScore = 0;
    this.botScore = 0;
    this.currentRound = 0;
    this.resetStats();
    this.stats.matchStartTime = Date.now();

    globalEvents.emit(EVENTS.GAME_START);
    this.startRound();
  }

  /**
   * Start a new round
   */
  startRound() {
    this.currentRound++;
    this.setState(GAME_STATES.COUNTDOWN);
    this.countdownValue = 3;

    globalEvents.emit(EVENTS.ROUND_START, {
      round: this.currentRound,
      playerScore: this.playerScore,
      botScore: this.botScore,
    });
  }

  /**
   * Update countdown
   */
  updateCountdown(deltaTime, audioManager) {
    this.stateTimer += deltaTime;

    const newCountdown = Math.ceil(3 - this.stateTimer);
    
    // Debug log
    // console.log(`Countdown: ${this.stateTimer.toFixed(2)} -> ${newCountdown}`);

    if (newCountdown !== this.countdownValue && newCountdown > 0) {
      this.countdownValue = newCountdown;
      if (audioManager) {
        audioManager.play('countdown');
      }
      globalEvents.emit(EVENTS.ROUND_COUNTDOWN, { value: this.countdownValue });
    }

    if (this.stateTimer >= 3) {
      this.setState(GAME_STATES.PLAYING);
      if (audioManager) {
        audioManager.play('roundStart');
      }
    }
  }

  /**
   * End current round
   */
  endRound(winner, audioManager) {
    if (winner === 'player') {
      this.playerScore++;
      this.stats.playerKills++;
      this.stats.botDeaths++;
    } else if (winner === 'bot') {
      this.botScore++;
      this.stats.botKills++;
      this.stats.playerDeaths++;
    }

    if (audioManager) {
      audioManager.play('roundEnd');
    }

    globalEvents.emit(EVENTS.ROUND_END, {
      winner,
      round: this.currentRound,
      playerScore: this.playerScore,
      botScore: this.botScore,
    });

    this.setState(GAME_STATES.ROUND_END);

    // Clear any existing timers
    this.clearPendingTimers();

    // Check for match end
    if (this.playerScore >= this.roundsToWin || this.botScore >= this.roundsToWin) {
      this.pendingMatchEndTimer = setTimeout(() => {
        this.pendingMatchEndTimer = null;
        this.endMatch(audioManager);
      }, GAME.ROUND_END_DELAY);
    } else {
      this.pendingRoundTimer = setTimeout(() => {
        this.pendingRoundTimer = null;
        this.startRound();
      }, GAME.ROUND_END_DELAY);
    }
  }

  /**
   * Clear pending round/match timers
   */
  clearPendingTimers() {
    if (this.pendingRoundTimer) {
      clearTimeout(this.pendingRoundTimer);
      this.pendingRoundTimer = null;
    }
    if (this.pendingMatchEndTimer) {
      clearTimeout(this.pendingMatchEndTimer);
      this.pendingMatchEndTimer = null;
    }
  }

  /**
   * End match
   */
  endMatch(audioManager) {
    const winner = this.playerScore > this.botScore ? 'player' : 'bot';

    this.setState(GAME_STATES.MATCH_END);

    if (audioManager) {
      audioManager.play(winner === 'player' ? 'victory' : 'defeat');
    }

    globalEvents.emit(EVENTS.MATCH_END, {
      winner,
      playerScore: this.playerScore,
      botScore: this.botScore,
      stats: this.getStats(),
    });
  }

  /**
   * Pause game
   */
  pause() {
    // Allow pausing during Gameplay, Countdown, or Round End
    if (
      this.currentState === GAME_STATES.PLAYING ||
      this.currentState === GAME_STATES.COUNTDOWN ||
      this.currentState === GAME_STATES.ROUND_END
    ) {
      this.stateBeforePause = this.currentState;

      // Save countdown progress if pausing during countdown
      if (this.currentState === GAME_STATES.COUNTDOWN) {
        this.savedStateTimer = this.stateTimer;
      }

      // Clear pending timers to prevent state changes while paused
      this.clearPendingTimers();

      this.setState(GAME_STATES.PAUSED);
      globalEvents.emit(EVENTS.GAME_PAUSE);
    }
  }

  /**
   * Resume game
   */
  resume() {
    if (this.currentState === GAME_STATES.PAUSED) {
      // Restore the state we were in before pausing
      const targetState = this.stateBeforePause || GAME_STATES.PLAYING;
      this.setState(targetState);

      // Restore countdown progress if resuming to countdown
      if (targetState === GAME_STATES.COUNTDOWN) {
        this.stateTimer = this.savedStateTimer;
      }

      globalEvents.emit(EVENTS.GAME_RESUME);

      // If resuming from ROUND_END, restart the round transition timer
      if (targetState === GAME_STATES.ROUND_END) {
        // Check for match end
        if (this.playerScore >= this.roundsToWin || this.botScore >= this.roundsToWin) {
          this.pendingMatchEndTimer = setTimeout(() => {
            this.pendingMatchEndTimer = null;
            this.endMatch();
          }, GAME.ROUND_END_DELAY);
        } else {
          this.pendingRoundTimer = setTimeout(() => {
            this.pendingRoundTimer = null;
            this.startRound();
          }, GAME.ROUND_END_DELAY);
        }
      }
    }
  }

  /**
   * Toggle pause
   */
  togglePause() {
    if (this.currentState === GAME_STATES.PAUSED) {
      this.resume();
    } else if (this.currentState === GAME_STATES.PLAYING) {
      this.pause();
    }
  }

  /**
   * Return to menu
   */
  returnToMenu() {
    this.clearPendingTimers();
    this.setState(GAME_STATES.MENU);
  }

  /**
   * Record a deflection
   */
  recordDeflection() {
    this.stats.totalDeflections++;
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      playerKills: 0,
      playerDeaths: 0,
      botKills: 0,
      botDeaths: 0,
      totalDeflections: 0,
      matchStartTime: Date.now(),
    };
  }

  /**
   * Get current statistics
   */
  getStats() {
    return {
      ...this.stats,
      matchDuration: Date.now() - this.stats.matchStartTime,
    };
  }

  /**
   * Get match info
   */
  getMatchInfo() {
    return {
      currentRound: this.currentRound,
      roundsToWin: this.roundsToWin,
      playerScore: this.playerScore,
      botScore: this.botScore,
      state: this.currentState,
    };
  }

  /**
   * Get countdown value
   */
  getCountdown() {
    return this.countdownValue;
  }
}
