import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { site } from '@/lib/site'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = `${site.name} · ${site.tagline}`

/**
 * Image de partage generee a la demande, pour que le wordmark reste
 * vectoriel et suive la marque sans qu'on ait a re-exporter un PNG.
 * La police est lue depuis `assets/fonts/` : aucun appel reseau au build.
 */
export default async function OpengraphImage() {
  const archivoBlack = await readFile(
    join(process.cwd(), 'assets', 'fonts', 'ArchivoBlack-Regular.ttf'),
  )

  const chips = [
    { label: 'Le garant', color: '#ffd23f' },
    { label: 'Le locataire', color: '#7de08a' },
    { label: "L'agence", color: '#9db8ff' },
  ]

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 40,
        backgroundColor: '#fff6e8',
        fontFamily: 'Archivo Black',
        border: '16px solid #141414',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', fontSize: 128, color: '#141414' }}>
        <span>CLOI</span>
        <div
          style={{
            width: 41,
            height: 160,
            margin: '0 10px',
            borderRadius: 20,
            backgroundColor: '#ffd23f',
            border: '9px solid #141414',
            transform: 'rotate(6deg)',
          }}
        />
        <span>SON</span>
      </div>

      <div style={{ display: 'flex', fontSize: 38, color: '#2b3ef0' }}>{site.tagline}</div>

      <div style={{ display: 'flex', gap: 20 }}>
        {chips.map((chip) => (
          <div
            key={chip.label}
            style={{
              display: 'flex',
              padding: '14px 32px',
              fontSize: 26,
              color: '#141414',
              backgroundColor: chip.color,
              border: '4px solid #141414',
              borderRadius: 999,
            }}
          >
            {chip.label}
          </div>
        ))}
      </div>
    </div>,
    {
      ...size,
      fonts: [{ name: 'Archivo Black', data: archivoBlack, style: 'normal', weight: 400 }],
    },
  )
}
