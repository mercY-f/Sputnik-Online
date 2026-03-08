<?php

namespace App\Interfaces;

interface RoleInterface
{
    /**
     * Check if the instance has the given role.
     *
     * @param string $roleName
     * @return bool
     */
    public function hasRole(string $roleName): bool;

    /**
     * Check if the instance has the given privilege.
     *
     * @param string $privilegeName
     * @return bool
     */
    public function hasPrivilege(string $privilegeName): bool;
}
