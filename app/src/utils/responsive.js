import { Dimensions, PixelRatio, Platform, StatusBar } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Base design dimensions (iPhone 14 / Android standard)
const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;

// Scale based on screen width
export function wp(percentage) {
  return PixelRatio.roundToNearestPixel((SCREEN_WIDTH * percentage) / 100);
}

// Scale based on screen height
export function hp(percentage) {
  return PixelRatio.roundToNearestPixel((SCREEN_HEIGHT * percentage) / 100);
}

// Scale font size proportionally
export function fs(size) {
  const scale = SCREEN_WIDTH / BASE_WIDTH;
  const newSize = size * scale;
  return Math.round(PixelRatio.roundToNearestPixel(newSize));
}

// Moderate scale (less aggressive than full scale)
export function ms(size, factor = 0.5) {
  return size + (fs(size) - size) * factor;
}

// Check if tablet
export function isTablet() {
  const aspectRatio = SCREEN_HEIGHT / SCREEN_WIDTH;
  return SCREEN_WIDTH >= 600 || aspectRatio < 1.6;
}

// Get status bar height
export function getStatusBarHeight() {
  if (Platform.OS === 'ios') return 44;
  return StatusBar.currentHeight || 24;
}

// Get bottom safe area (for devices with gesture navigation)
export function getBottomInset() {
  if (Platform.OS === 'ios') return 34;
  return 0;
}

export const SCREEN = {
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
  isSmall: SCREEN_WIDTH < 360,
  isMedium: SCREEN_WIDTH >= 360 && SCREEN_WIDTH < 414,
  isLarge: SCREEN_WIDTH >= 414,
  isTablet: isTablet(),
};
