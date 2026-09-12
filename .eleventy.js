module.exports = function (eleventyConfig) {
  // Passthrough copy
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy(".nojekyll");

  // Global site data
  eleventyConfig.addGlobalData("site", {
    name: "Anas Touil",
    description: "DevOps / Platform Engineer",
    url: "https://antoyavin.github.io",
  });

  // Filters
  eleventyConfig.addFilter("readableDate", (dateObj) => {
    if (!dateObj) return "";
    return new Date(dateObj).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  });

  eleventyConfig.addFilter("isoDate", (dateObj) => {
    if (!dateObj) return "";
    return new Date(dateObj).toISOString().split("T")[0];
  });

  eleventyConfig.addFilter("head", (arr, n) => {
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, n);
  });

  // Collections
  eleventyConfig.addCollection("posts", (api) =>
    api
      .getFilteredByGlob("content/posts/*.md")
      .sort((a, b) => b.date - a.date)
  );

  eleventyConfig.addCollection("projects", (api) =>
    api
      .getFilteredByGlob("content/projects/*.md")
      .sort((a, b) => b.data.year - a.data.year)
  );

  eleventyConfig.addCollection("about", (api) =>
    api.getFilteredByGlob("content/about.md")
  );

  eleventyConfig.addCollection("postTags", (api) => {
    const posts = api.getFilteredByGlob("content/posts/*.md");
    const tagSet = new Set();
    posts.forEach((post) => {
      (post.data.tags || []).forEach((tag) => tagSet.add(tag));
    });
    return [...tagSet].sort();
  });

  return {
    dir: {
      input: ".",
      layouts: "_layouts",
      includes: "_includes",
      output: "_site",
    },
    templateFormats: ["njk", "md", "html"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
};
