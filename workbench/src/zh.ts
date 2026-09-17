import * as OpenCC from "opencc-js/cn2t";

/** 卡片数据（卡名 / 分类 / 参数名）沿用简体源文件，只在界面显示时转成台湾繁体 */
const convert = OpenCC.Converter({ from: "cn", to: "twp" });
const cache = new Map<string, string>();

export const tw = (s: string): string => {
  let out = cache.get(s);
  if (out === undefined) {
    out = convert(s).replace(/臺/g, "台");
    cache.set(s, out);
  }
  return out;
};
