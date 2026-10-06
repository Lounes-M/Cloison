export type ApercuActe = {
  pages: { largeur: number; hauteur: number }[]
  png: string
  page: number
}
export type EtatApercuActe = { message: string; apercu?: ApercuActe }
