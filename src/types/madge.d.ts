declare module "madge" {
  interface MadgeResult {
    obj(): Record<string, string[]>;
    circular(): string[][];
  }
  interface MadgeConfig {
    baseDir?: string;
    fileExtensions?: string[];
    tsConfig?: string;
    detectiveOptions?: Record<string, unknown>;
  }
  export default function madge(path: string | string[], config?: MadgeConfig): Promise<MadgeResult>;
}
