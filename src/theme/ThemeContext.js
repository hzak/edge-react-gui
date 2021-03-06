// @flow

import { cacheStyles as cacheStylesInner, makeThemeContext } from 'react-native-patina'

import { type Theme } from '../types/Theme.js'
import { edgeDark } from './variables/edgeDark.js'

// Provide the theme context methods:
const themeContext = makeThemeContext(edgeDark)
export const { ThemeProvider, useTheme, withTheme, changeTheme, getTheme, watchTheme } = themeContext

export type ThemeProps = {
  theme: Theme
}

/**
 * Wrap cacheStyles with our specific Theme type.
 */
export function cacheStyles<Styles: Object>(callback: (theme: Theme) => Styles): (theme: Theme) => Styles {
  return cacheStylesInner(callback)
}
