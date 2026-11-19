#!/usr/bin/env python3
"""
Genere les SVG maitres du kit de marque Cloison (logo, symbole, favicon).

Le logo du site est du texte (`components/brand/Logo.tsx`) : Poppins demi-gras,
une barre orange inclinee de 6 degres entre CLOI et SON. Hors du site (PNG,
reseaux sociaux, presse), on a besoin d'un fichier autonome : ce script
vectorise les lettres depuis `assets/fonts/` et reproduit la geometrie CSS du
composant, pour que les deux rendus soient superposables.

Dependances (outil de design, pas du site) : `pip install fonttools uharfbuzz`.
Usage, depuis la racine du depot :

    python3 scripts/marque/generer-svg.py
    node scripts/marque/rasteriser.mjs

Le premier ecrit les SVG dans `public/brand/` et `app/icon.svg`, le second en
tire les PNG et le favicon ICO.
"""

from __future__ import annotations

import math
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

RACINE = Path(__file__).resolve().parents[2]
POLICES = RACINE / "assets" / "fonts"
SORTIE = RACINE / "public" / "brand"

# Charte de novembre 2026 : doit rester alignee sur `app/globals.css`.
CREME = "#faf4ec"
ENCRE = "#1e1e1e"
NUIT = "#000000"
VERT = "#035946"
ORANGE = "#fe5000"
ROSE = "#edb8d5"
BLANC = "#ffffff"
GRIS = "#5e5e5e"

# Geometrie du composant Logo, en em (voir Logo.tsx et globals.css).
ECART = 0.08  # gap du inline-flex
MARGE_BARRE = 0.08  # mx-[0.08em]
LARGEUR_BARRE = 0.28
HAUTEUR_BARRE = 1.1
INCLINAISON = 6.0  # degres


class Police:
    def __init__(self, fichier: str):
        chemin = POLICES / fichier
        self.tt = TTFont(chemin)
        self.upem = self.tt["head"].unitsPerEm
        self.glyphes = self.tt.getGlyphSet()
        self.ordre = self.tt.getGlyphOrder()
        hhea = self.tt["hhea"]
        self.ascendante = hhea.ascent / self.upem
        self.descendante = -hhea.descent / self.upem
        self.hb = hb.Font(hb.Face(chemin.read_bytes()))

    def ligne_de_base(self) -> float:
        """Position de la ligne de base dans une boite `line-height: 1`, en em."""
        demi_interligne = (1 - (self.ascendante + self.descendante)) / 2
        return demi_interligne + self.ascendante

    def composer(self, texte: str, taille: float, x: float, y_base: float):
        """Renvoie (chemin SVG, avance, boite englobante) du texte vectorise."""
        tampon = hb.Buffer()
        tampon.add_str(texte)
        tampon.guess_segment_properties()
        hb.shape(self.hb, tampon, {"kern": True, "liga": True})
        echelle = taille / self.upem
        morceaux: list[str] = []
        curseur = 0.0
        xs, ys = [], []
        for info, pos in zip(tampon.glyph_infos, tampon.glyph_positions):
            nom = self.ordre[info.codepoint]
            gx = x + (curseur + pos.x_offset) * echelle
            gy = y_base - pos.y_offset * echelle
            stylo = SVGPathPen(self.glyphes, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
            self.glyphes[nom].draw(TransformPen(stylo, (echelle, 0, 0, -echelle, gx, gy)))
            trace = stylo.getCommands()
            if trace:
                morceaux.append(trace)
                bornes = self._bornes(nom)
                if bornes:
                    x0, y0, x1, y1 = bornes
                    xs += [gx + x0 * echelle, gx + x1 * echelle]
                    ys += [gy - y1 * echelle, gy - y0 * echelle]
            curseur += pos.x_advance
        boite = (min(xs), min(ys), max(xs), max(ys)) if xs else (x, y_base, x, y_base)
        return "".join(morceaux), curseur * echelle, boite

    def avance(self, texte: str, taille: float) -> float:
        return self.composer(texte, taille, 0, 0)[1]

    def _bornes(self, nom: str):
        glyf = self.tt["glyf"][nom]
        if not hasattr(glyf, "xMin"):
            return None
        return glyf.xMin, glyf.yMin, glyf.xMax, glyf.yMax


DEMI_GRAS = Police("Poppins-SemiBold.ttf")
MOYEN = Police("Poppins-Medium.ttf")


def barre(cx: float, cy: float, taille: float, couleur: str) -> tuple[str, tuple]:
    """La barre du logo, centree sur (cx, cy), et sa boite englobante exacte."""
    l, h = LARGEUR_BARRE * taille, HAUTEUR_BARRE * taille
    r = l / 2
    svg = (
        f'<rect x="{cx - l / 2:.2f}" y="{cy - h / 2:.2f}" width="{l:.2f}" height="{h:.2f}" '
        f'rx="{r:.2f}" fill="{couleur}" transform="rotate({INCLINAISON:g} {cx:.2f} {cy:.2f})"/>'
    )
    # Une barre a bouts ronds est un segment epaissi : ses extremes sont les
    # deux centres d'arrondi, tournes, plus le rayon.
    a = math.radians(INCLINAISON)
    demi = h / 2 - r
    dx, dy = -math.sin(a) * demi, math.cos(a) * demi
    xs = [cx + dx, cx - dx]
    ys = [cy + dy, cy - dy]
    return svg, (min(xs) - r, min(ys) - r, max(xs) + r, max(ys) + r)


def union(*boites):
    return (
        min(b[0] for b in boites),
        min(b[1] for b in boites),
        max(b[2] for b in boites),
        max(b[3] for b in boites),
    )


def mot_symbole(taille: float, texte: str, couleur_barre: str):
    """Compose CLOI | SON a l'origine, comme le inline-flex du composant."""
    base = HAUTEUR_BARRE / 2 * taille - 0.5 * taille + DEMI_GRAS.ligne_de_base() * taille
    gauche, av_gauche, b_gauche = DEMI_GRAS.composer("CLOI", taille, 0, base)
    x_barre = av_gauche + (ECART + MARGE_BARRE) * taille
    cx = x_barre + LARGEUR_BARRE * taille / 2
    cy = HAUTEUR_BARRE * taille / 2
    rect, b_barre = barre(cx, cy, taille, couleur_barre)
    x_droite = x_barre + (LARGEUR_BARRE + MARGE_BARRE + ECART) * taille
    droite, _, b_droite = DEMI_GRAS.composer("SON", taille, x_droite, base)
    return gauche + droite, rect, union(b_gauche, b_barre, b_droite)


def document(largeur: float, hauteur: float, corps: str, titre: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {largeur:.0f} {hauteur:.0f}" '
        f'width="{largeur:.0f}" height="{hauteur:.0f}" role="img" aria-label="{titre}">'
        f"<title>{titre}</title>{corps}</svg>\n"
    )


def logo(nom: str, fond: str | None, texte: str, couleur_barre: str, avec_baseline=False):
    taille = 400.0
    lettres, rect, boite = mot_symbole(taille, "CLOISON", couleur_barre)
    corps_logo = f'<path fill="{texte}" d="{lettres}"/>{rect}'
    largeur_logo = boite[2] - boite[0]
    hauteur_logo = boite[3] - boite[1]

    if not avec_baseline:
        marge_x, marge_y = 0.45 * largeur_logo / 2.3, 0.6 * hauteur_logo
        largeur = largeur_logo + 2 * marge_x
        hauteur = hauteur_logo + 2 * marge_y
        dx, dy = marge_x - boite[0], marge_y - boite[1]
        corps = f'<g transform="translate({dx:.2f} {dy:.2f})">{corps_logo}</g>'
    else:
        # Logo, filet vertical, puis la signature en Poppins medium.
        taille_sig = taille * 0.36
        filet_ecart = taille * 0.42
        x_filet = boite[2] + filet_ecart
        x_sig = x_filet + filet_ecart
        centre = (boite[1] + boite[3]) / 2
        base_sig = centre + 0.35 * taille_sig  # cap-height Poppins ~0.7 em
        signature, av_sig, b_sig = MOYEN.composer("Le coffre à trois clés", taille_sig, x_sig, base_sig)
        couleur_sig = texte if fond in (VERT, NUIT) else VERT
        filet = (
            f'<rect x="{x_filet - 3:.2f}" y="{boite[1]:.2f}" width="6" height="{hauteur_logo:.2f}" '
            f'rx="3" fill="{texte}" opacity="0.25"/>'
        )
        tout = union(boite, b_sig)
        marge_x, marge_y = 0.55 * hauteur_logo, 0.75 * hauteur_logo
        largeur = tout[2] - tout[0] + 2 * marge_x
        hauteur = tout[3] - tout[1] + 2 * marge_y
        dx, dy = marge_x - tout[0], marge_y - tout[1]
        corps = (
            f'<g transform="translate({dx:.2f} {dy:.2f})">{corps_logo}{filet}'
            f'<path fill="{couleur_sig}" d="{signature}"/></g>'
        )

    if fond:
        corps = f'<rect width="100%" height="100%" fill="{fond}"/>' + corps
    titre = "Cloison, le coffre à trois clés" if avec_baseline else "Cloison"
    (SORTIE / f"{nom}.svg").write_text(document(largeur, hauteur, corps, titre), encoding="utf-8")


def symbole(arrondi: bool) -> str:
    """Le symbole : la barre orange sur un carre vert. Uniquement des formes."""
    rx = ' rx="14"' if arrondi else ""
    fond = f'<rect width="64" height="64"{rx} fill="{VERT}"/>'
    trait = (
        f'<rect x="26" y="11" width="12" height="42" rx="6" fill="{ORANGE}" '
        f'transform="rotate({INCLINAISON:g} 32 32)"/>'
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Cloison">'
        f"<title>Cloison</title>{fond}{trait}</svg>\n"
    )


def main():
    SORTIE.mkdir(parents=True, exist_ok=True)
    # Declinaisons du logo : (nom, fond, lettres, barre).
    logo("cloison-primaire", CREME, ENCRE, ORANGE)
    logo("cloison-transparent", None, ENCRE, ORANGE)
    logo("cloison-vert", VERT, CREME, ORANGE)
    logo("cloison-rose", ROSE, ENCRE, ORANGE)
    logo("cloison-inverse-noir", NUIT, CREME, ORANGE)
    logo("cloison-blanc", None, BLANC, ORANGE)
    logo("cloison-monochrome", None, ENCRE, ENCRE)
    logo("cloison-monochrome-blanc", None, BLANC, BLANC)
    logo("cloison-baseline", CREME, ENCRE, ORANGE, avec_baseline=True)
    logo("cloison-baseline-vert", VERT, CREME, ORANGE, avec_baseline=True)

    arrondi, plein = symbole(True), symbole(False)
    (SORTIE / "cloison-symbole.svg").write_text(arrondi, encoding="utf-8")
    (SORTIE / "cloison-symbole-plein.svg").write_text(plein, encoding="utf-8")
    (SORTIE / "cloison-favicon.svg").write_text(arrondi, encoding="utf-8")
    (RACINE / "app" / "icon.svg").write_text(arrondi, encoding="utf-8")
    print("SVG ecrits dans", SORTIE.relative_to(RACINE))


if __name__ == "__main__":
    main()
