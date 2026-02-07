module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets");

  // Copy raw YAML work files so the Edit download feature can fetch them
  eleventyConfig.addPassthroughCopy({ "works": "works-raw" });

  eleventyConfig.addWatchTarget("./works/");
  eleventyConfig.addWatchTarget("./loci.yaml");
  eleventyConfig.addWatchTarget("./_cache/");

  // Nunjucks filter: pad string to a given length
  eleventyConfig.addFilter("padEnd", function (str, len) {
    str = String(str || "");
    while (str.length < len) str += " ";
    return str;
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
  };
};
