export const App = jest.fn()
export const Editor = jest.fn()
export const MarkdownView = jest.fn()
export const Platform = { isDesktop: true }
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
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Jest mock: 复用 js-yaml 与生产环境(Obsidian 内嵌)行为一致
const yaml = require('js-yaml') as { load: (input: string) => unknown }
export const parseYaml = jest.fn((input: string) => yaml.load(input))
