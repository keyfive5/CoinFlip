import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { HeadsFace, TailsFace } from './src/CoinFaces';

type Face = 'heads' | 'tails';

const COIN = 264;
const RISE = 200;
const UP_MS = 560;
const DOWN_MS = 470;
const TALLY_KEY = 'coinflip.tally';

const isWeb = Platform.OS === 'web';

function fairFlip(): Face {
  const byte = Crypto.getRandomBytes(1)[0];
  return byte % 2 === 0 ? 'heads' : 'tails';
}

export default function App() {
  const [flipping, setFlipping] = useState(false);
  const [result, setResult] = useState<Face | null>(null);
  const [tally, setTally] = useState({ heads: 0, tails: 0 });
  const [hasFlipped, setHasFlipped] = useState(false);

  // cumulative rotation in degrees; coin shows heads at 0 (mod 360)
  const rotationRef = useRef(0);
  const spin = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const label = useRef(new Animated.Value(0)).current;
  const hint = useRef(new Animated.Value(1)).current;

  const flipSound = useRef<AudioPlayer | null>(null);
  const catchSound = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    flipSound.current = createAudioPlayer(require('./assets/sounds/flip.wav'));
    catchSound.current = createAudioPlayer(require('./assets/sounds/catch.wav'));
    return () => {
      flipSound.current?.remove();
      catchSound.current?.remove();
    };
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(TALLY_KEY).then((raw) => {
      if (raw) {
        try {
          const t = JSON.parse(raw);
          if (typeof t.heads === 'number' && typeof t.tails === 'number') setTally(t);
        } catch {}
      }
    });
  }, []);

  const play = useCallback(async (p: AudioPlayer | null) => {
    if (!p) return;
    try {
      // expo-audio: replays are silent no-ops on iOS without a rewind first
      await p.seekTo(0);
      p.play();
    } catch {}
  }, []);

  const haptic = useCallback((fn: () => Promise<void>) => {
    if (!isWeb) fn().catch(() => {});
  }, []);

  const flip = useCallback(() => {
    if (flipping) return;
    setFlipping(true);
    setResult(null);

    if (!hasFlipped) {
      setHasFlipped(true);
      Animated.timing(hint, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    }

    const outcome = fairFlip();

    // land exactly on the outcome: even half-turns keep the facing side,
    // odd half-turns swap it
    const facingTails = Math.round(rotationRef.current / 180) % 2 === 1;
    const needSwap = (outcome === 'tails') !== facingTails;
    const halfTurns = 8 + (needSwap ? 1 : 0);
    const target = rotationRef.current + halfTurns * 180;
    rotationRef.current = target;

    haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    play(flipSound.current);

    // mid-air haptic ticks while the coin spins
    [140, 320, 540, 780].forEach((ms) =>
      setTimeout(() => haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)), ms),
    );

    Animated.timing(spin, {
      toValue: target,
      duration: UP_MS + DOWN_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

    Animated.sequence([
      Animated.timing(lift, {
        toValue: -RISE,
        duration: UP_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(lift, {
        toValue: 0,
        duration: DOWN_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
      play(catchSound.current);

      // settle bounce
      Animated.sequence([
        Animated.timing(lift, {
          toValue: -18,
          duration: 120,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(lift, {
          toValue: 0,
          duration: 140,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();

      setResult(outcome);
      label.setValue(0);
      Animated.timing(label, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();

      setTally((t) => {
        const next = { ...t, [outcome]: t[outcome] + 1 };
        AsyncStorage.setItem(TALLY_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
      setFlipping(false);
    });
  }, [flipping, hasFlipped, haptic, play, spin, lift, label, hint]);

  const resetTally = useCallback(() => {
    haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    setTally({ heads: 0, tails: 0 });
    AsyncStorage.setItem(TALLY_KEY, JSON.stringify({ heads: 0, tails: 0 })).catch(() => {});
  }, [haptic]);

  // each face carries its own 3D rotation (backfaceVisibility only works on
  // the element's own transform — rotating a shared parent flattens children
  // and the swap never happens, on web and native alike)
  const rotateHeads = spin.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });
  const rotateTails = spin.interpolate({
    inputRange: [0, 360],
    outputRange: ['180deg', '540deg'],
  });
  const shadowScale = lift.interpolate({
    inputRange: [-RISE, 0],
    outputRange: [0.45, 1],
  });
  const shadowOpacity = lift.interpolate({
    inputRange: [-RISE, 0],
    outputRange: [0.12, 0.4],
  });

  return (
    <Pressable style={styles.root} onPress={flip}>
      <StatusBar style="light" />

      {/* ambient glow behind the coin */}
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="44%" r="46%">
            <Stop offset="0%" stopColor="#3a3122" stopOpacity="0.9" />
            <Stop offset="60%" stopColor="#1a1a20" stopOpacity="0.4" />
            <Stop offset="100%" stopColor="#0d0e12" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="44" r="50" fill="url(#glow)" />
      </Svg>

      <View style={styles.stage}>
        {/* ground shadow — soft radial, no hard edges */}
        <Animated.View
          style={[
            styles.shadow,
            { opacity: shadowOpacity, transform: [{ scaleX: shadowScale }, { scaleY: shadowScale }] },
          ]}
        >
          <Svg width="100%" height="100%" viewBox="0 0 100 30">
            <Defs>
              <RadialGradient id="ground" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor="#000" stopOpacity="0.9" />
                <Stop offset="70%" stopColor="#000" stopOpacity="0.35" />
                <Stop offset="100%" stopColor="#000" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Ellipse cx="50" cy="15" rx="49" ry="14" fill="url(#ground)" />
          </Svg>
        </Animated.View>
        {/* the coin */}
        <Animated.View style={[styles.coin, { transform: [{ translateY: lift }] }]}>
          <Animated.View
            style={[styles.face, { transform: [{ perspective: 900 }, { rotateX: rotateHeads }] }]}
          >
            <HeadsFace />
          </Animated.View>
          <Animated.View
            style={[styles.face, { transform: [{ perspective: 900 }, { rotateX: rotateTails }] }]}
          >
            <TailsFace />
          </Animated.View>
        </Animated.View>
      </View>

      <View style={styles.below} pointerEvents="none">
        <Animated.Text style={[styles.result, { opacity: label }]}>
          {result === 'heads' ? 'HEADS' : result === 'tails' ? 'TAILS' : ' '}
        </Animated.Text>
        {!hasFlipped && (
          <Animated.Text style={[styles.hintText, { opacity: hint }]}>TAP TO FLIP</Animated.Text>
        )}
      </View>

      <Pressable style={styles.tally} onLongPress={resetTally} delayLongPress={600}>
        <Text style={styles.tallyText}>
          HEADS {tally.heads}
          <Text style={styles.tallyDot}> · </Text>
          TAILS {tally.tails}
        </Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0d0e12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: COIN + 70,
  },
  coin: {
    width: COIN,
    height: COIN,
  },
  face: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backfaceVisibility: 'hidden',
  },
  shadow: {
    position: 'absolute',
    bottom: -40,
    width: COIN * 0.86,
    height: 44,
  },
  below: {
    height: 110,
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 46,
  },
  result: {
    color: '#EFC75E',
    fontSize: 34,
    fontWeight: '600',
    letterSpacing: 10,
    marginLeft: 10, // visually recenter letterspaced text
  },
  hintText: {
    position: 'absolute',
    top: 8,
    width: 320,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.35)',
    fontSize: 14,
    fontWeight: '400',
    letterSpacing: 5,
    marginLeft: 5,
  },
  tally: {
    position: 'absolute',
    bottom: 54,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  tallyText: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 2.5,
  },
  tallyDot: {
    color: 'rgba(255,255,255,0.2)',
  },
});
