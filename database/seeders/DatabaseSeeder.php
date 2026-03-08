<?php

namespace Database\Seeders;

use App\Models\User;
// use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Create Privileges
        $privilegeRead = \App\Models\Privilege::create(['name' => 'read', 'description' => 'Can read data']);
        $privilegeWrite = \App\Models\Privilege::create(['name' => 'write', 'description' => 'Can create data']);
        $privilegeEdit = \App\Models\Privilege::create(['name' => 'edit', 'description' => 'Can update data']);
        $privilegeDelete = \App\Models\Privilege::create(['name' => 'delete', 'description' => 'Can delete data']);

        // Create Roles
        $adminRole = \App\Models\Role::create(['name' => 'admin', 'description' => 'Administrator with full access']);
        $userRole = \App\Models\Role::create(['name' => 'user', 'description' => 'Standard user']);
        $guestRole = \App\Models\Role::create(['name' => 'guest', 'description' => 'Guest with read-only access']);

        // Assign Privileges to Roles
        $adminRole->privileges()->attach([$privilegeRead->id, $privilegeWrite->id, $privilegeEdit->id, $privilegeDelete->id]);
        $userRole->privileges()->attach([$privilegeRead->id, $privilegeWrite->id]);
        $guestRole->privileges()->attach([$privilegeRead->id]);

        // Create Admin User
        $admin = User::factory()->create([
            'name' => 'Admin User',
            'email' => 'admin@example.com',
            'password' => bcrypt('password'),
            'role_id' => $adminRole->id,
        ]);

        \App\Models\UserProfile::create([
            'user_id' => $admin->id,
            'bio' => 'System Administrator',
            'timezone' => 'UTC',
        ]);

        // Create Standard User
        $standardUser = User::factory()->create([
            'name' => 'Standard User',
            'email' => 'user@example.com',
            'password' => bcrypt('password'),
            'role_id' => $userRole->id,
        ]);

        \App\Models\UserProfile::create([
            'user_id' => $standardUser->id,
            'bio' => 'Space Enthusiast',
            'timezone' => 'UTC',
        ]);

        // Create Guest User
        $guestUser = User::factory()->create([
            'name' => 'Guest User',
            'email' => 'guest@example.com',
            'password' => bcrypt('password'),
            'role_id' => $guestRole->id,
        ]);

        // Create Default Categories
        $categories = ['ISS', 'STARLINK', 'ONEWEB', 'IRIDIUM', 'NAVIGATION', 'WEATHER', 'OTHER', 'Communication'];
        foreach ($categories as $cat) {
            \App\Models\SatelliteCategory::firstOrCreate(['name' => $cat]);
        }
    }
}
