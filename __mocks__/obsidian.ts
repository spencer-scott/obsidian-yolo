export const App = jest.fn()
export const apiVersion = '1.8.0'
export const Editor = jest.fn()
export const MarkdownView = jest.fn()
export const Platform = { isDesktop: true, isMobile: false }
export const TFile = jest.fn()
export const TFolder = jest.fn()
export const Vault = jest.fn()
export class FileSystemAdapter {
  getBasePath(): string {
    return ''
  }
}
export const normalizePath = jest.fn((path: string) => path)
export const htmlToMarkdown = jest.fn((html: string) => html)
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Jest mock: reuse js-yaml so behavior matches production (Obsidian's embedded YAML)
const yaml = require('js-yaml') as { load: (input: string) => unknown }
export const parseYaml = jest.fn((input: string) => yaml.load(input))
