# Shared infrastructure provisioned by infra-bootstrap. chess-tactics only needs
# the shared resource group's location to place its own media resources; the rest
# of the app's Azure surface is owned here.

data "azurerm_client_config" "current" {}

data "azuread_client_config" "current" {}

data "azurerm_resource_group" "infra" {
  name = "infra"
}
