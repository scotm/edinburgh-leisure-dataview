// Strip out HTML from a string
export function stripHTML(html: string) {
  return html.replace(/(<([^>]+)>)/gi, "");
}
