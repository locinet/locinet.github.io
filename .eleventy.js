const { EleventyHtmlBasePlugin } = require("@11ty/eleventy");

module.exports = function (eleventyConfig) {
  eleventyConfig.addPlugin(EleventyHtmlBasePlugin);
  eleventyConfig.addPassthroughCopy("src/assets");

  eleventyConfig.addWatchTarget("./works/");
  eleventyConfig.addWatchTarget("./loci.yaml");
  eleventyConfig.addWatchTarget("./traditions.yaml");
  eleventyConfig.addWatchTarget("./translators.yaml");
  eleventyConfig.addWatchTarget("./display_names.yaml");
  eleventyConfig.addWatchTarget("./earlyprint.yaml");
  eleventyConfig.addWatchTarget("./_cache/");

  // Nunjucks filter: pad string to a given length
  eleventyConfig.addFilter("padEnd", function (str, len) {
    str = String(str || "");
    while (str.length < len) str += " ";
    return str;
  });

  return {
    pathPrefix: process.env.PATH_PREFIX || "/",
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
  };
};
