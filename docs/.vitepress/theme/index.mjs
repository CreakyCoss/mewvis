import DefaultTheme from "vitepress/theme";
import { tokenizeDocumentText } from "../search.mjs";
import "./style.css";

export default {
  ...DefaultTheme,
  enhanceApp(context) {
    DefaultTheme.enhanceApp?.(context);
    // Functions are omitted from serialized site data; restore the tokenizer
    // so Chinese queries use the same segmentation as the build-time index.
    context.siteData.value.themeConfig.search.options.miniSearch.options.tokenize =
      tokenizeDocumentText;
  },
};
