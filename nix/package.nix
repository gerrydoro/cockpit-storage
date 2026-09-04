{
  lib,
  buildNpmPackage,
  importNpmLock,
  cockpit,
  gettext,
  writeShellScriptBin,
}:

buildNpmPackage {
  pname = "cockpit-storage";
  version = "0.1.0";

  src = ./..;

  npmDeps = importNpmLock { npmRoot = ./..; };

  npmConfigHook = importNpmLock.npmConfigHook;

  npmPackFlags = [ "--ignore-scripts" ];

  nativeBuildInputs = [
    gettext
    (writeShellScriptBin "git" "true")
  ];

  postPatch = ''
    substituteInPlace Makefile \
      --replace-fail '@git rev-list --quiet --objects $(COCKPIT_REPO_TREE) -- 2>/dev/null || \' '@true' \
      --replace-fail 'git fetch --no-tags --no-write-fetch-head --depth=1 $(COCKPIT_REPO_URL) $(COCKPIT_REPO_COMMIT)' '@true' \
      --replace-fail 'git archive $(COCKPIT_REPO_TREE) -- $(COCKPIT_REPO_FILES) | tar x' '@true' \
      --replace-fail '/usr/local' "$out"
  '';

  dontNpmBuild = true;

  buildPhase = ''
    runHook preBuild

    mkdir -p pkg; cp -r ${cockpit.src}/pkg/lib pkg
    mkdir -p test; cp -r ${cockpit.src}/test/common test

    patchShebangs build.js

    make

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p $out/share/cockpit/storage
    cp -r dist/* $out/share/cockpit/storage/
    mkdir -p $out/share/metainfo/
    make po/LINGUAS

    msgfmt --xml -d po \
      --template org.cockpit_project.storage.metainfo.xml \
      -o $out/share/metainfo/org.cockpit_project.storage.metainfo.xml

    runHook postInstall
  '';

  meta = {
    description = "Disk and directory usage analyzer for Cockpit";
    homepage = "https://github.com/gerrydoro/cockpit-storage";
    platforms = lib.platforms.linux;
    license = [ lib.licenses.lgpl21 ];
  };
}
