{
  description = "Disk and directory usage analyzer for Cockpit";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { self, nixpkgs }:
    let
      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          cockpit-storage = pkgs.callPackage ./nix/package.nix { };
          default = self.packages.${system}.cockpit-storage;
        }
      );

      overlays.default = final: prev: {
        cockpit-storage = final.callPackage ./nix/package.nix { };
      };
    };
}
