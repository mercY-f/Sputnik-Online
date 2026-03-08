<?php

namespace App\Traits;

trait HasRolesAndPrivileges
{
    /**
     * Check if user has a specific role.
     *
     * @param string $roleName
     * @return bool
     */
    public function hasRole(string $roleName): bool
    {
        return $this->role !== null && $this->role->name === $roleName;
    }

    /**
     * Check if user has a specific privilege by name through their role.
     *
     * @param string $privilegeName
     * @return bool
     */
    public function hasPrivilege(string $privilegeName): bool
    {
        if (!$this->role) {
            return false;
        }

        // Check if role has the requested privilege
        return $this->role->privileges->contains('name', $privilegeName);
    }
}
