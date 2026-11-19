import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { site } from '@/lib/site'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = `${site.name} · ${site.tagline}`

/** Charte de novembre 2026, alignee sur `app/globals.css`. */
const VERT = '#035946'
const ORANGE = '#fe5000'
const ROSE = '#edb8d5'
const CREME = '#faf4ec'
const ENCRE = '#1e1e1e'
const MENTHE = '#d5e3dc'

/**
 * Image de partage generee a la demande, pour que le wordmark reste
 * vectoriel et suive la marque sans qu'on ait a re-exporter un PNG.
 * Les polices sont lues depuis `assets/fonts/` : aucun appel reseau au build.
 */
export default async function OpengraphImage() {
  const [demiGras, moyen] = await Promise.all([
    readFile(join(process.cwd(), 'assets', 'fonts', 'Poppins-SemiBold.ttf')),
    readFile(join(process.cwd(), 'assets', 'fonts', 'Poppins-Medium.ttf')),
  ])

  const chips = [
    { label: 'Le garant', color: ROSE },
    { label: 'Le locataire', color: MENTHE },
    { label: "L'agence", color: CREME },
  ]

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: VERT,
        fontFamily: 'Poppins',
      }}
    >
      {/* Carte rose aux coins de 40 px qui deborde du cadre, comme les sections
          du site, portant la barre du logo en grand. */}
      <div
        style={{
          position: 'absolute',
          left: 880,
          top: 64,
          width: 420,
          height: 640,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 120,
          backgroundColor: ROSE,
          borderRadius: 40,
        }}
      >
        <div
          style={{
            width: 76,
            height: 300,
            borderRadius: 38,
            backgroundColor: ORANGE,
            transform: 'rotate(6deg)',
            marginTop: -60,
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 36,
          padding: '0 96px',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: 132,
            fontWeight: 600,
            lineHeight: 1,
            color: CREME,
          }}
        >
          <span>CLOI</span>
          <div
            style={{
              width: 37,
              height: 145,
              margin: '0 21px',
              borderRadius: 18,
              backgroundColor: ORANGE,
              transform: 'rotate(6deg)',
            }}
          />
          <span>SON</span>
        </div>

        <div
          style={{
            display: 'flex',
            fontSize: 52,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: ROSE,
          }}
        >
          {site.tagline}
        </div>

        <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
          {chips.map((chip) => (
            <div
              key={chip.label}
              style={{
                display: 'flex',
                padding: '12px 28px',
                fontSize: 26,
                fontWeight: 500,
                color: ENCRE,
                backgroundColor: chip.color,
                borderRadius: 10,
              }}
            >
              {chip.label}
            </div>
          ))}
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Poppins', data: demiGras, style: 'normal', weight: 600 },
        { name: 'Poppins', data: moyen, style: 'normal', weight: 500 },
      ],
    },
  )
}
