import React from 'react'
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg'

type Props = {
  size?: number
}

export default function ArthFlowLogo({ size = 32 }: Props) {
  const sw  = (size / 32) * 3.6
  const sw2 = (size / 32) * 3.0
  const sw3 = (size / 32) * 2.4

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <Defs>
        <LinearGradient id="goldGrad" x1="10" y1="95" x2="90" y2="5" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#7A4F00" />
          <Stop offset="25%" stopColor="#A67C00" />
          <Stop offset="50%" stopColor="#C9981A" />
          <Stop offset="75%" stopColor="#DAA520" />
          <Stop offset="100%" stopColor="#E8BF44" />
        </LinearGradient>
        <LinearGradient id="goldFill" x1="30" y1="90" x2="70" y2="10" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#A67C00" stopOpacity="0.08" />
          <Stop offset="100%" stopColor="#DAA520" stopOpacity="0.04" />
        </LinearGradient>
      </Defs>
      {/* Outer teardrop frame — subtle fill for emboss */}
      <Path
        d="M50,4 C68,18 86,42 86,65 C86,83 69,95 50,95 C31,95 14,83 14,65 C14,42 32,18 50,4 Z"
        stroke="url(#goldGrad)"
        strokeWidth={sw}
        strokeLinejoin="round"
        fill="url(#goldFill)"
      />
      {/* Center stem */}
      <Path
        d="M50,88 L50,6"
        stroke="url(#goldGrad)"
        strokeWidth={sw2}
        strokeLinecap="round"
      />
      {/* Left grain strand */}
      <Path
        d="M50,87 C46,76 27,64 21,52 C16,40 24,24 50,7"
        stroke="url(#goldGrad)"
        strokeWidth={sw2}
        strokeLinecap="round"
        fill="none"
      />
      {/* Right grain strand */}
      <Path
        d="M50,87 C54,76 73,64 79,52 C84,40 76,24 50,7"
        stroke="url(#goldGrad)"
        strokeWidth={sw2}
        strokeLinecap="round"
        fill="none"
      />
      {/* Bottom horizontal connector */}
      <Path
        d="M21,70 L79,70"
        stroke="url(#goldGrad)"
        strokeWidth={sw2}
        strokeLinecap="round"
      />
      {/* Left upper rib */}
      <Path
        d="M21,52 C28,48 40,47 50,49"
        stroke="url(#goldGrad)"
        strokeWidth={sw3}
        strokeLinecap="round"
        fill="none"
      />
      {/* Right upper rib */}
      <Path
        d="M79,52 C72,48 60,47 50,49"
        stroke="url(#goldGrad)"
        strokeWidth={sw3}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  )
}
