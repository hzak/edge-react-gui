// @flow

import { bns } from 'biggystring'
import * as React from 'react'
import { Animated, Image, Text, TextInput, TouchableWithoutFeedback, View } from 'react-native'
import slowlog from 'react-native-slowlog'
import FAIcon from 'react-native-vector-icons/MaterialIcons'

import * as Constants from '../../../../constants/indexConstants'
import * as intl from '../../../../locales/intl.js'
import { THEME } from '../../../../theme/variables/airbitz.js'
import { scale } from '../../../../util/scaling.js'
import * as UTILS from '../../../../util/utils.js'
import { bottom, styles, top } from './styles.js'

export type FlipInputFieldInfo = {
  currencyName: string,
  currencySymbol: string, // currency symbol of field
  currencyCode: string, // 3-5 digit currency code

  // Maximum number of decimals to allow the user to enter. FlipInput will automatically truncate use input to this
  // number of decimals as the user types.
  maxEntryDecimals: number,

  // Maximum number of decimals to convert from the opposite field to this field.
  // ie If the user is typing into the fiat field, and this FlipInputFieldInfo refers to a BTC field, then this is the number of
  // decimals to use when converting the fiat value into this crypto field.
  maxConversionDecimals: number
}

type State = {
  isToggled: boolean,
  textInputFrontFocus: boolean,
  textInputBackFocus: boolean,
  overridePrimaryDecimalAmount: string,
  forceUpdateGuiCounter: number,
  primaryDisplayAmount: string, // Actual display amount including 1000s separator and localized for region
  secondaryDisplayAmount: string, // Actual display amount including 1000s separator and localized for region
  rerenderCounter: number,
  selectionPrimary?: {
    start: number,
    end: number
  },
  selectionSecondary?: {
    start: number,
    end: number
  }
}

export type FlipInputOwnProps = {
  // Override value of the primary field. This will be the initial value of the primary field. Only changes to this value will
  // cause changes to the primary field
  overridePrimaryDecimalAmount: string,

  // Exchange rate
  exchangeSecondaryToPrimaryRatio: string,

  // Information regarding the primary and secondary field. Mostly related to currency name, code, and denominations
  primaryInfo: FlipInputFieldInfo,
  secondaryInfo: FlipInputFieldInfo,
  onNext?: () => void,
  forceUpdateGuiCounter: number,

  // Callback when primaryDecimalAmount changes. **This is only called when the user types into a field or if
  // exchangeSecondaryToPrimaryRatio changes. This does NOT get called when overridePrimaryDecimalAmount is changed by the parent
  onAmountChanged(decimalAmount: string): void,
  isEditable: boolean,
  isFiatOnTop: boolean,
  isFocus: boolean,

  topReturnKeyType?: string,
  inputAccessoryViewID?: string,
  headerText: string,
  headerLogo: string | void,
  headerCallback?: () => void,
  keyboardVisible: boolean
}

type Props = FlipInputOwnProps

// Assumes a US locale decimal input
function setPrimaryToSecondary(props: Props, primaryDecimalAmount: string) {
  // Formats into locale specific format. Add currency symbol
  const primaryDisplayAmount = addCurrencySymbol(props.primaryInfo.currencySymbol, intl.formatNumberInput(primaryDecimalAmount))

  // Converts to secondary value using exchange rate
  let secondaryDecimalAmount = bns.mul(primaryDecimalAmount, props.exchangeSecondaryToPrimaryRatio)

  // Truncate to however many decimals the secondary format should have
  secondaryDecimalAmount = UTILS.truncateDecimals(secondaryDecimalAmount, props.secondaryInfo.maxConversionDecimals)

  // Format into locale specific format. Add currency symbol
  const secondaryDisplayAmount = addCurrencySymbol(props.secondaryInfo.currencySymbol, intl.formatNumberInput(secondaryDecimalAmount))

  // Set the state for display in render()
  return { primaryDisplayAmount, secondaryDisplayAmount }
}

// Pretty much the same as setPrimaryToSecondary
function setSecondaryToPrimary(props: Props, secondaryDecimalAmount: string) {
  const secondaryDisplayAmount = addCurrencySymbol(props.secondaryInfo.currencySymbol, intl.formatNumberInput(secondaryDecimalAmount))
  let primaryDecimalAmount = props.exchangeSecondaryToPrimaryRatio === '0' ? '0' : bns.div(secondaryDecimalAmount, props.exchangeSecondaryToPrimaryRatio, 18)
  primaryDecimalAmount = UTILS.truncateDecimals(primaryDecimalAmount, props.primaryInfo.maxConversionDecimals)
  const primaryDisplayAmount = addCurrencySymbol(props.primaryInfo.currencySymbol, intl.formatNumberInput(primaryDecimalAmount))
  return { secondaryDisplayAmount, primaryDisplayAmount, primaryDecimalAmount }
}

const addCurrencySymbol = (currencySymbol: string, displayAmount: string) =>
  displayAmount.includes(currencySymbol) ? displayAmount : `${currencySymbol} ${displayAmount}`
const removeCurrencySymbol = (currencySymbol: string, previousDisplayAmount: string, displayAmount: string) => {
  // This looks for a number left if the currency symbol and moves it to the far right
  if (previousDisplayAmount === displayAmount.substring(1)) {
    displayAmount = previousDisplayAmount + (displayAmount[0] || '')
  }
  return displayAmount.replace(currencySymbol, '').trim()
}

const getInitialState = (props: Props) => {
  const state: State = {
    isToggled: false,
    textInputFrontFocus: false,
    textInputBackFocus: false,
    overridePrimaryDecimalAmount: '',
    primaryDisplayAmount: '',
    forceUpdateGuiCounter: 0,
    secondaryDisplayAmount: '',
    rerenderCounter: 0
  }

  let stateAmounts = {}
  if (props.overridePrimaryDecimalAmount !== '') {
    const primaryDecimalAmount = UTILS.truncateDecimals(props.overridePrimaryDecimalAmount, props.primaryInfo.maxEntryDecimals)
    stateAmounts = setPrimaryToSecondary(props, primaryDecimalAmount)
  }
  const newState = Object.assign(state, stateAmounts)
  return newState
}

export class FlipInput extends React.Component<Props, State> {
  animatedValue: Animated.Value
  frontInterpolate: Animated.Value
  backInterpolate: Animated.Value
  androidFrontOpacityInterpolate: Animated.Value
  androidBackOpacityInterpolate: Animated.Value
  textInputFront: TextInput | null
  textInputBack: TextInput | null

  constructor(props: Props) {
    super(props)
    this.state = getInitialState(props)
    slowlog(this, /.*/, global.slowlogOptions)

    // Mounting Animation
    this.animatedValue = new Animated.Value(0)
    this.frontInterpolate = this.animatedValue.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '180deg']
    })

    this.backInterpolate = this.animatedValue.interpolate({
      inputRange: [0, 1],
      outputRange: ['180deg', '360deg']
    })
    this.androidFrontOpacityInterpolate = this.animatedValue.interpolate({
      inputRange: [0, 0.5, 0.5],
      outputRange: [1, 1, 0]
    })
    this.androidBackOpacityInterpolate = this.animatedValue.interpolate({
      inputRange: [0.5, 0.5, 1],
      outputRange: [0, 1, 1]
    })
  }

  componentDidMount() {
    setTimeout(() => {
      if (this.props.keyboardVisible && this.props.overridePrimaryDecimalAmount === '0' && this.textInputFront) {
        this.textInputFront.focus()
      }
    }, 400)

    if (this.props.isFiatOnTop) {
      this.setState({
        isToggled: !this.state.isToggled
      })
      Animated.timing(this.animatedValue, {
        toValue: 1,
        duration: 0
      }).start()
      setTimeout(() => {
        this.setState({
          secondaryDisplayAmount: ''
        })
      }, 10)
    }

    if (this.props.isFocus) {
      setTimeout(() => {
        this.textInputBack && this.textInputBack.focus()
      }, 650)
    }
  }

  UNSAFE_componentWillReceiveProps(nextProps: Props) {
    // Check if primary changed first. Don't bother to check secondary if parent passed in a primary
    if (
      nextProps.overridePrimaryDecimalAmount !== this.state.overridePrimaryDecimalAmount ||
      nextProps.forceUpdateGuiCounter !== this.state.forceUpdateGuiCounter
    ) {
      const primaryDecimalAmount = UTILS.truncateDecimals(nextProps.overridePrimaryDecimalAmount, nextProps.primaryInfo.maxEntryDecimals)
      this.setState(setPrimaryToSecondary(nextProps, primaryDecimalAmount))
      this.setState({
        overridePrimaryDecimalAmount: nextProps.overridePrimaryDecimalAmount,
        forceUpdateGuiCounter: nextProps.forceUpdateGuiCounter
      })
    } else {
      if (!this.state.isToggled) {
        const decimalAmount = intl.formatToNativeNumber(
          removeCurrencySymbol(this.props.primaryInfo.currencySymbol, this.state.primaryDisplayAmount, this.state.primaryDisplayAmount)
        )
        this.setState({ selectionPrimary: undefined, selectionSecondary: undefined })
        this.setState(setPrimaryToSecondary(nextProps, decimalAmount))
      } else {
        const decimalAmount = intl.formatToNativeNumber(
          removeCurrencySymbol(this.props.secondaryInfo.currencySymbol, this.state.secondaryDisplayAmount, this.state.secondaryDisplayAmount)
        )
        const newState = setSecondaryToPrimary(nextProps, decimalAmount)
        this.setState({
          selectionPrimary: undefined,
          selectionSecondary: undefined,
          primaryDisplayAmount: newState.primaryDisplayAmount,
          secondaryDisplayAmount: newState.secondaryDisplayAmount
        })
      }
    }
    if (nextProps.primaryInfo.currencyCode !== this.props.primaryInfo.currencyCode) {
      setTimeout(() => this.onPrimaryAmountChange('0'), 50)
    }
  }

  toggleCryptoOnTop = () => {
    if (this.state.isToggled) {
      this.onToggleFlipInput()
    }
  }

  onToggleFlipInput = () => {
    this.setState({
      isToggled: !this.state.isToggled
    })
    if (this.state.isToggled) {
      if (this.textInputFront) {
        this.textInputFront.focus()
      }
      Animated.spring(this.animatedValue, {
        toValue: 0,
        friction: 8,
        tension: 10
      }).start()
    }
    if (!this.state.isToggled) {
      if (this.textInputBack) {
        this.textInputBack.focus()
      }
      Animated.spring(this.animatedValue, {
        toValue: 1,
        friction: 8,
        tension: 10
      }).start()
    }
  }

  onPrimaryAmountChange = (amountChanged: string) => {
    const displayAmount = removeCurrencySymbol(this.props.primaryInfo.currencySymbol, this.state.primaryDisplayAmount, amountChanged)
    this.setState({ selectionPrimary: undefined, selectionSecondary: undefined })
    if (!intl.isValidInput(displayAmount)) return

    // Do any necessary formatting of the display value such as truncating decimals
    const formattedDisplayAmount = intl.truncateDecimals(intl.prettifyNumber(displayAmount), this.props.primaryInfo.maxEntryDecimals)

    // Format to standard US decimals with no 1000s separator. This is what we return to the parent view in the callback
    const decimalAmount = intl.formatToNativeNumber(formattedDisplayAmount)

    const result = setPrimaryToSecondary(this.props, decimalAmount)
    this.setState(result, () => {
      this.props.onAmountChanged(decimalAmount)
    })
  }

  onSecondaryAmountChange = (amountChanged: string) => {
    const displayAmount = removeCurrencySymbol(this.props.secondaryInfo.currencySymbol, this.state.secondaryDisplayAmount, amountChanged)
    this.setState({ selectionPrimary: undefined, selectionSecondary: undefined })
    if (!intl.isValidInput(displayAmount)) return

    // Do any necessary formatting of the display value such as truncating decimals
    const formattedDisplayAmount = intl.truncateDecimals(intl.prettifyNumber(displayAmount), this.props.secondaryInfo.maxEntryDecimals)

    // Format to standard US decimals with no 1000s separator. This is what we return to the parent view in the callback
    const decimalAmount = intl.formatToNativeNumber(formattedDisplayAmount)

    const result = setSecondaryToPrimary(this.props, decimalAmount)
    this.setState(
      {
        primaryDisplayAmount: result.primaryDisplayAmount,
        secondaryDisplayAmount: result.secondaryDisplayAmount
      },
      () => {
        this.props.onAmountChanged(result.primaryDecimalAmount)
      }
    )
  }

  textInputTopFocus = () => {
    if (this.state.isToggled) {
      if (this.textInputBack) {
        this.textInputBack.focus()
      }
    } else {
      if (this.textInputFront) {
        this.textInputFront.focus()
      }
    }
  }

  textInputTopBlur = () => {
    if (this.state.isToggled) {
      if (this.textInputBack) {
        this.textInputBack.blur()
      }
    } else {
      if (this.textInputFront) {
        this.textInputFront.blur()
      }
    }
  }

  getTextInputFrontRef = (ref: TextInput | null) => {
    this.textInputFront = ref
  }

  textInputFrontFocusTrue = () => {
    this.setState({ textInputFrontFocus: true, rerenderCounter: this.state.rerenderCounter + 1 })
  }

  textInputFrontFocusFalse = () => {
    this.setState({ textInputFrontFocus: false })
  }

  textInputFrontFocus = () => {
    if (this.textInputFront) {
      this.textInputFront.focus()
    }
  }

  inputSelectionPrimaryChange = (amount: string) => {
    if (this.state.selectionPrimary) {
      this.setState({ selectionPrimary: undefined })
    } else {
      this.setState({
        selectionPrimary: {
          start: amount.length,
          end: amount.length
        }
      })
    }
  }

  inputSelectionSecondaryChange = (amount: string) => {
    if (this.state.selectionSecondary) {
      this.setState({ selectionSecondary: undefined })
    } else {
      this.setState({
        selectionSecondary: {
          start: amount.length,
          end: amount.length
        }
      })
    }
  }

  topRowFront = (fieldInfo: FlipInputFieldInfo, onChangeText: string => void, amount: string) => {
    return (
      <TouchableWithoutFeedback onPress={this.textInputFrontFocus}>
        <View style={top.row} key="top">
          <Text style={top.currencyCode}>{fieldInfo.currencyCode}</Text>
          <View style={top.amountContainer}>
            <TextInput
              style={top.amount}
              placeholder="0"
              placeholderTextColor={THEME.COLORS.OPAQUE_WHITE_3}
              value={amount}
              onChangeText={onChangeText}
              autoCorrect={false}
              keyboardType="numeric"
              selectionColor={THEME.COLORS.WHITE}
              selection={this.state.selectionPrimary}
              onSelectionChange={() => this.inputSelectionPrimaryChange(amount)}
              returnKeyType={this.props.topReturnKeyType || 'done'}
              underlineColorAndroid={THEME.COLORS.TRANSPARENT}
              ref={this.getTextInputFrontRef}
              onFocus={this.textInputFrontFocusTrue}
              onBlur={this.textInputFrontFocusFalse}
              editable={this.props.isEditable}
              onSubmitEditing={this.props.onNext}
              inputAccessoryViewID={this.props.inputAccessoryViewID || null}
            />
          </View>
        </View>
      </TouchableWithoutFeedback>
    )
  }

  getTextInputBackRef = (ref: TextInput | null) => {
    this.textInputBack = ref
  }

  textInputBackFocusTrue = () => {
    this.setState({ textInputBackFocus: true })
  }

  textInputBackFocusFalse = () => {
    this.setState({ textInputBackFocus: false })
  }

  textInputBackFocus = () => {
    if (this.textInputBack) {
      this.textInputBack.focus()
    }
  }

  topRowBack = (fieldInfo: FlipInputFieldInfo, onChangeText: string => void, amount: string) => {
    return (
      <TouchableWithoutFeedback onPress={this.textInputBackFocus}>
        <View style={top.row} key="top">
          <Text style={top.currencyCode}>{fieldInfo.currencyName}</Text>
          <View style={top.amountContainer}>
            <TextInput
              style={top.amount}
              placeholder={this.props.isFiatOnTop ? 'Amount' : '0'}
              placeholderTextColor={THEME.COLORS.OPAQUE_WHITE_3}
              value={amount}
              onChangeText={onChangeText}
              autoCorrect={false}
              keyboardType="numeric"
              selectionColor={THEME.COLORS.WHITE}
              selection={this.state.selectionSecondary}
              onSelectionChange={() => this.inputSelectionSecondaryChange(amount)}
              returnKeyType={this.props.topReturnKeyType || 'done'}
              underlineColorAndroid={THEME.COLORS.TRANSPARENT}
              ref={this.getTextInputBackRef}
              onFocus={this.textInputBackFocusTrue}
              onBlur={this.textInputBackFocusFalse}
              editable={this.props.isEditable}
              onSubmitEditing={this.props.onNext}
              inputAccessoryViewID={this.props.inputAccessoryViewID || null}
            />
          </View>
        </View>
      </TouchableWithoutFeedback>
    )
  }

  bottomRow = (fieldInfo: FlipInputFieldInfo, amount: string) => {
    return (
      <TouchableWithoutFeedback onPress={this.onToggleFlipInput} key="bottom">
        <View style={bottom.row}>
          <Text style={bottom.currencyCode}>{fieldInfo.currencyCode}</Text>
          <View style={top.amountContainer}>
            <Text style={[bottom.amount, !amount && bottom.alert]} numberOfLines={1} ellipsizeMode="tail">
              {amount || '0'}
            </Text>
          </View>
        </View>
      </TouchableWithoutFeedback>
    )
  }

  render() {
    const { primaryInfo, secondaryInfo, headerText, headerLogo, headerCallback } = this.props
    const { isToggled } = this.state
    const frontAnimatedStyle = {
      transform: [{ rotateX: this.frontInterpolate }]
    }
    const backAnimatedStyle = {
      transform: [{ rotateX: this.backInterpolate }]
    }
    return (
      <View style={styles.container}>
        <TouchableWithoutFeedback onPress={headerCallback}>
          <View style={styles.flipContainerHeader}>
            <Image style={styles.flipContainerHeaderIcon} source={{ uri: headerLogo || '' }} />
            <View style={styles.flipContainerHeaderTextContainer}>
              <Text style={styles.flipContainerHeaderText}>{headerText}</Text>
              {headerCallback && <FAIcon style={styles.flipContainerHeaderTextDropDown} name={Constants.KEYBOARD_ARROW_DOWN} size={scale(20)} />}
            </View>
          </View>
        </TouchableWithoutFeedback>
        <View style={styles.flipContainerBody}>
          <Animated.View
            style={[styles.flipContainerFront, frontAnimatedStyle, { opacity: this.androidFrontOpacityInterpolate }]}
            pointerEvents={isToggled ? 'none' : 'auto'}
          >
            <View style={styles.flipButton}>
              <FAIcon style={styles.flipIcon} onPress={this.onToggleFlipInput} name={Constants.SWAP_VERT} size={scale(26)} />
            </View>
            <View style={styles.rows}>
              {this.topRowFront(primaryInfo, this.onPrimaryAmountChange, this.state.primaryDisplayAmount)}
              {this.bottomRow(secondaryInfo, this.state.secondaryDisplayAmount)}
            </View>
          </Animated.View>
          <Animated.View
            style={[styles.flipContainerFront, styles.flipContainerBack, backAnimatedStyle, { opacity: this.androidBackOpacityInterpolate }]}
            pointerEvents={isToggled ? 'auto' : 'none'}
          >
            <View style={styles.flipButton}>
              <FAIcon style={styles.flipIcon} onPress={this.onToggleFlipInput} name={Constants.SWAP_VERT} size={scale(26)} />
            </View>
            <View style={styles.rows}>
              {this.topRowBack(secondaryInfo, this.onSecondaryAmountChange, this.state.secondaryDisplayAmount)}
              {this.bottomRow(primaryInfo, this.state.primaryDisplayAmount)}
            </View>
          </Animated.View>
        </View>
      </View>
    )
  }
}
