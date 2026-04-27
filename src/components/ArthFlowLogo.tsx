import React from 'react'
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg'

type Props = {
  size?: number
}

export default function ArthFlowLogo({ size = 32 }: Props) {
  const sw  = (size / 32) * 3.2
  const sw2 = (size / 32) * 2.6
  const sw3 = (size / 32) * 2.2

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <Defs>
        <LinearGradient id="goldGrad" x1="15" y1="92" x2="82" y2="6" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#A86400" />
          <Stop offset="35%" stopColor="#C8860A" />
          <Stop offset="70%" stopColor="#E0A820" />
          <Stop offset="100%" stopColor="#F0CC50" />
        </LinearGradient>
      </Defs>
      {/* Outer teardrop frame */}
      <Path
        d="M50,4 C68,18 86,42 86,65 C86,83 69,95 50,95 C31,95 14,83 14,65 C14,42 32,18 50,4 Z"
        stroke="url(#goldGrad)"
        strokeWidth={sw}
        strokeLinejoin="round"
        fill="none"
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
